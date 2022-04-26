import {
    CreateObservableOptions,
    getAnnotationFromOptions,
    propagateChanged,
    isAnnotation,
    $mobx,
    Atom,
    Annotation,
    ComputedValue,
    IAtom,
    IComputedValueOptions,
    IEnhancer,
    IInterceptable,
    IListenable,
    Lambda,
    ObservableValue,
    addHiddenProp,
    createInstanceofPredicate,
    endBatch,
    getNextId,
    hasInterceptors,
    hasListeners,
    interceptChange,
    isObject,
    isPlainObject,
    isSpyEnabled,
    notifyListeners,
    referenceEnhancer,
    registerInterceptor,
    registerListener,
    spyReportEnd,
    spyReportStart,
    startBatch,
    stringifyKey,
    globalState,
    ADD,
    UPDATE,
    die,
    hasProp,
    getDescriptor,
    storedAnnotationsSymbol,
    ownKeys,
    isOverride,
    defineProperty,
    autoAnnotation,
    getAdministration,
    getDebugName,
    objectPrototype,
    MakeResult
} from "../internal"

/**
 * 装饰器缓存,键为缓存的属性key,值为获取属性值的方法
 */
const descriptorCache = Object.create(null)

export type IObjectDidChange<T = any> = {
    observableKind: "object"
    name: PropertyKey
    object: T
    debugObjectName: string
} & (
    | {
          type: "add"
          newValue: any
      }
    | {
          type: "update"
          oldValue: any
          newValue: any
      }
    | {
          type: "remove"
          oldValue: any
      }
)

export type IObjectWillChange<T = any> =
    | {
          object: T
          type: "update" | "add"
          name: PropertyKey
          newValue: any
      }
    | {
          object: T
          type: "remove"
          name: PropertyKey
      }

const REMOVE = "remove"

export class ObservableObjectAdministration
    implements IInterceptable<IObjectWillChange>, IListenable
{
    keysAtom_: IAtom
    changeListeners_
    interceptors_
    proxy_: any
    /**
     * 是否是纯对象
     */
    isPlainObject_: boolean
    /**
     * 已有注解
     */
    appliedAnnotations_?: object
    private pendingKeys_: undefined | Map<PropertyKey, ObservableValue<boolean>>

    constructor(
        public target_: any,
        public values_ = new Map<PropertyKey, ObservableValue<any> | ComputedValue<any>>(),
        public name_: string,
        // Used anytime annotation is not explicitly provided
        // 没有传值的的时候,默认为 autoAnnotation
        public defaultAnnotation_: Annotation = autoAnnotation
    ) {
        this.keysAtom_ = new Atom(__DEV__ ? `${this.name_}.keys` : "ObservableObject.keys")
        // Optimization: we use this frequently
        this.isPlainObject_ = isPlainObject(this.target_)
        if (__DEV__ && !isAnnotation(this.defaultAnnotation_)) {
            // 注解格式错误
            die(`defaultAnnotation must be valid annotation`)
        }
        if (__DEV__) {
            // Prepare structure for tracking which fields were already annotated
            this.appliedAnnotations_ = {}
        }
    }
    /**
     * 获取观察对象上的值
     * @param key 需要获取值的键
     * @returns 获取到观察对象上对应key的值
     */
    getObservablePropValue_(key: PropertyKey): any {
        return this.values_.get(key)!.get()
    }

    /**
     * 设置可观察对象的值
     * @param key 需要设置值的键
     * @param newValue 需要设置的值
     * @returns
     */
    setObservablePropValue_(key: PropertyKey, newValue): boolean | null {
        const observable = this.values_.get(key)
        if (observable instanceof ComputedValue) {
            // 如果是computed的值,则直接设值,并返回true
            observable.set(newValue)
            return true
        }

        // intercept
        if (hasInterceptors(this)) {
            // 有拦截
            const change = interceptChange<IObjectWillChange>(this, {
                type: UPDATE,
                object: this.proxy_ || this.target_,
                name: key,
                newValue
            })
            if (!change) {
                // 如果拦截器返回的值为空,则返回null
                return null
            }
            // 如果拦截器有返回值,则把需要更新的值改为拦截器的返回值
            newValue = (change as any).newValue
        }
        // 再经历具体值的修改前置处理,得出新值
        newValue = (observable as any).prepareNewValue_(newValue)

        // notify spy & observers
        if (newValue !== globalState.UNCHANGED) {
            // 需要改变
            // 有属性观察者
            const notify = hasListeners(this)
            // 有全局观察者,例如devtools
            const notifySpy = __DEV__ && isSpyEnabled()
            // 更改信息,如果没有观察者,则为null
            const change: IObjectDidChange | null =
                notify || notifySpy
                    ? {
                          type: UPDATE,
                          observableKind: "object",
                          debugObjectName: this.name_,
                          object: this.proxy_ || this.target_,
                          oldValue: (observable as any).value_,
                          name: key,
                          newValue
                      }
                    : null

            if (__DEV__ && notifySpy) {
                // 通知全局观察者,开始更改
                spyReportStart(change!)
            }
            // 为需要设置的观察值赋新值
            ;(observable as ObservableValue<any>).setNewValue_(newValue)
            if (notify) {
                // 通知观察者
                notifyListeners(this, change)
            }
            if (__DEV__ && notifySpy) {
                // 通知全局观察者,结束更改
                spyReportEnd()
            }
        }
        return true
    }

    get_(key: PropertyKey): any {
        if (globalState.trackingDerivation && !hasProp(this.target_, key)) {
            // Key doesn't exist yet, subscribe for it in case it's added later
            // 当前有正在运行的derivation,并且目标对象上没有该对应的键值,订阅它以备他稍后被添加
            this.has_(key)
        }
        return this.target_[key]
    }

    /**
     * @param {PropertyKey} key
     * @param {any} value
     * @param {Annotation|boolean} annotation true - use default annotation, false - copy as is
     * @param {boolean} proxyTrap whether it's called from proxy trap
     * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
     */
    set_(key: PropertyKey, value: any, proxyTrap: boolean = false): boolean | null {
        // Don't use .has(key) - we care about own
        // 属性在target_对象上有,不包括原型
        if (hasProp(this.target_, key)) {
            // Existing prop
            if (this.values_.has(key)) {
                // 该属性是可观察的值,使用设置可观察值的方式设置
                // Observable (can be intercepted)
                return this.setObservablePropValue_(key, value)
            } else if (proxyTrap) {
                // Non-observable - proxy
                // 是proxy捕获器的set,为this.target_赋值,此时使用Reflect.set为其属性赋值,返回是否成功
                return Reflect.set(this.target_, key, value)
            } else {
                // Non-observable
                // 直接赋值,然后返回true
                this.target_[key] = value
                return true
            }
        } else {
            // New prop
            // 新的属性
            return this.extend_(
                key,
                { value, enumerable: true, writable: true, configurable: true },
                this.defaultAnnotation_,
                proxyTrap
            )
        }
    }

    // Trap for "in"
    has_(key: PropertyKey): boolean {
        if (!globalState.trackingDerivation) {
            // Skip key subscription outside derivation
            // 如果没有正在运行的derivation,则返回该键是否存在目标对象上
            return key in this.target_
        }
        this.pendingKeys_ ||= new Map()
        let entry = this.pendingKeys_.get(key)
        if (!entry) {
            // 如果pendingKeys_内没有对应该key的值,则创建一个可观察值
            entry = new ObservableValue(
                key in this.target_,
                referenceEnhancer,
                __DEV__ ? `${this.name_}.${stringifyKey(key)}?` : "ObservableObject.key?",
                false
            )
            // 把创建的可观察值与key对应设置在pendingKeys_
            this.pendingKeys_.set(key, entry)
        }
        return entry.get()
    }

    /**
     * @param {PropertyKey} key
     * @param {Annotation|boolean} annotation true - use default annotation, false - ignore prop
     */
    make_(key: PropertyKey, annotation: Annotation | boolean): void {
        if (annotation === true) {
            annotation = this.defaultAnnotation_
        }
        if (annotation === false) {
            // annotation 为 false 的时候,忽略
            return
        }
        // 断言是否可以注解
        assertAnnotable(this, annotation, key)
        if (!(key in this.target_)) {
            // Throw on missing key, except for decorators:
            // Decorator annotations are collected from whole prototype chain.
            // When called from super() some props may not exist yet.
            // However we don't have to worry about missing prop,
            // because the decorator must have been applied to something.
            if (this.target_[storedAnnotationsSymbol]?.[key]) {
                // 将被子级注解
                return // will be annotated by subclass constructor
            } else {
                // 没有该字段
                die(1, annotation.annotationType_, `${this.name_}.${key.toString()}`)
            }
        }
        let source = this.target_
        while (source && source !== objectPrototype) {
            const descriptor = getDescriptor(source, key)
            // 如果属性在原型上,则没有descriptor
            if (descriptor) {
                const outcome = annotation.make_(this, key, descriptor, source)
                if (outcome === MakeResult.Cancel) {
                    return
                }
                if (outcome === MakeResult.Break) {
                    break
                }
            }
            // 获取原型
            source = Object.getPrototypeOf(source)
        }
        recordAnnotationApplied(this, annotation, key)
    }

    /**
     * @param {PropertyKey} key
     * @param {PropertyDescriptor} descriptor
     * @param {Annotation|boolean} annotation true - use default annotation, false - copy as is
     * @param {boolean} proxyTrap whether it's called from proxy trap
     * @returns {boolean|null} true on success, false on failure (proxyTrap + non-configurable), null when cancelled by interceptor
     */
    extend_(
        key: PropertyKey,
        descriptor: PropertyDescriptor,
        annotation: Annotation | boolean,
        proxyTrap: boolean = false
    ): boolean | null {
        if (annotation === true) {
            annotation = this.defaultAnnotation_
        }
        if (annotation === false) {
            return this.defineProperty_(key, descriptor, proxyTrap)
        }
        assertAnnotable(this, annotation, key)
        const outcome = annotation.extend_(this, key, descriptor, proxyTrap)
        if (outcome) {
            recordAnnotationApplied(this, annotation, key)
        }
        return outcome
    }

    /**
     * 为target上的key属性定义描述
     * @param {PropertyKey} key
     * @param {PropertyDescriptor} descriptor
     * @param {boolean} proxyTrap 是否是被proxy捕捉器调用 whether it's called from proxy trap
     * @returns {boolean|null} 成功返回true, 失败出错返回false(proxyTrap为true 且key是不可配置的), 当被拦截器取消的时候为 null
     */
    defineProperty_(
        key: PropertyKey,
        descriptor: PropertyDescriptor,
        proxyTrap: boolean = false
    ): boolean | null {
        try {
            startBatch()

            // Delete
            const deleteOutcome = this.delete_(key)
            if (!deleteOutcome) {
                // 删除操作失败了,或者拦截器拦截了
                return deleteOutcome
            }

            // ADD interceptor
            if (hasInterceptors(this)) {
                const change = interceptChange<IObjectWillChange>(this, {
                    object: this.proxy_ || this.target_,
                    name: key,
                    type: ADD,
                    newValue: descriptor.value
                })
                if (!change) {
                    // 拦截器打断
                    return null
                }
                const { newValue } = change as any
                if (descriptor.value !== newValue) {
                    // 如果装饰器值不等于拦截器操作后返回的值,则把值替换
                    descriptor = {
                        ...descriptor,
                        value: newValue
                    }
                }
            }

            // Define
            if (proxyTrap) {
                // 是proxy代理
                if (!Reflect.defineProperty(this.target_, key, descriptor)) {
                    // 定义失败
                    return false
                }
            } else {
                defineProperty(this.target_, key, descriptor)
            }

            // 通知改变
            this.notifyPropertyAddition_(key, descriptor.value)
        } finally {
            endBatch()
        }
        return true
    }

    // If original descriptor becomes relevant, move this to annotation directly
    /**
     * 定义可观察值属性
     * @param key 指定键
     * @param value 指定值
     * @param enhancer 劫持器,有多种类型,深度,浅度...
     * @param proxyTrap 是否是proxy捕获
     * @returns {boolean|null} 成功返回true, 失败出错返回false(proxyTrap为true 且key是不可配置的), 当被拦截器取消的时候为 null
     */
    defineObservableProperty_(
        key: PropertyKey,
        value: any,
        enhancer: IEnhancer<any>,
        proxyTrap: boolean = false
    ): boolean | null {
        try {
            startBatch()

            // Delete
            const deleteOutcome = this.delete_(key)
            if (!deleteOutcome) {
                // Failure or intercepted
                return deleteOutcome
            }

            // ADD interceptor
            if (hasInterceptors(this)) {
                const change = interceptChange<IObjectWillChange>(this, {
                    object: this.proxy_ || this.target_,
                    name: key,
                    type: ADD,
                    newValue: value
                })
                if (!change) {
                    return null
                }
                value = (change as any).newValue
            }

            const cachedDescriptor = getCachedObservablePropDescriptor(key)
            const descriptor = {
                configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
                enumerable: true,
                get: cachedDescriptor.get,
                set: cachedDescriptor.set
            }

            // Define
            if (proxyTrap) {
                if (!Reflect.defineProperty(this.target_, key, descriptor)) {
                    return false
                }
            } else {
                defineProperty(this.target_, key, descriptor)
            }

            // 创建可观察值,挂到this.values_上
            const observable = new ObservableValue(
                value,
                enhancer,
                __DEV__ ? `${this.name_}.${key.toString()}` : "ObservableObject.key",
                false
            )

            this.values_.set(key, observable)

            // Notify (value possibly changed by ObservableValue)
            this.notifyPropertyAddition_(key, observable.value_)
        } finally {
            endBatch()
        }
        return true
    }

    // If original descriptor becomes relevant, move this to annotation directly
    /**
     * 定义计算属性,且设置其描述符为不可枚举
     * @param key 计算属性键名
     * @param options 计算属性配置参数
     * @param proxyTrap 是否是proxy捕获
     * @returns
     */
    defineComputedProperty_(
        key: PropertyKey,
        options: IComputedValueOptions<any>,
        proxyTrap: boolean = false
    ): boolean | null {
        try {
            startBatch()

            // Delete
            const deleteOutcome = this.delete_(key)
            if (!deleteOutcome) {
                // Failure or intercepted
                return deleteOutcome
            }

            // ADD interceptor
            if (hasInterceptors(this)) {
                const change = interceptChange<IObjectWillChange>(this, {
                    object: this.proxy_ || this.target_,
                    name: key,
                    type: ADD,
                    newValue: undefined
                })
                if (!change) {
                    return null
                }
            }
            options.name ||= __DEV__ ? `${this.name_}.${key.toString()}` : "ObservableObject.key"
            options.context = this.proxy_ || this.target_
            const cachedDescriptor = getCachedObservablePropDescriptor(key)
            const descriptor = {
                configurable: globalState.safeDescriptors ? this.isPlainObject_ : true,
                enumerable: false, // 不可枚举
                get: cachedDescriptor.get,
                set: cachedDescriptor.set
            }

            // Define
            if (proxyTrap) {
                if (!Reflect.defineProperty(this.target_, key, descriptor)) {
                    return false
                }
            } else {
                defineProperty(this.target_, key, descriptor)
            }

            this.values_.set(key, new ComputedValue(options))

            // Notify
            this.notifyPropertyAddition_(key, undefined)
        } finally {
            endBatch()
        }
        return true
    }

    /**
     * 删除属性
     * @param {PropertyKey} key
     * @param {boolean} proxyTrap whether it's called from proxy trap
     * @returns {boolean|null} 成功返回true, 失败出错的时候为false(proxyTrap为true并且属性值是不可配置的), 被拦截器拦截取消的时候为null
     */
    delete_(key: PropertyKey, proxyTrap: boolean = false): boolean | null {
        // No such prop
        if (!hasProp(this.target_, key)) {
            // 没有该属性的时候直接返回true
            return true
        }

        // Intercept
        if (hasInterceptors(this)) {
            const change = interceptChange<IObjectWillChange>(this, {
                object: this.proxy_ || this.target_,
                name: key,
                type: REMOVE
            })
            // Cancelled
            if (!change) {
                // 拦截
                return null
            }
        }

        // Delete
        try {
            startBatch()
            const notify = hasListeners(this)
            const notifySpy = __DEV__ && isSpyEnabled()
            const observable = this.values_.get(key)
            // Value needed for spies/listeners
            let value = undefined
            // Optimization: don't pull the value unless we will need it
            if (!observable && (notify || notifySpy)) {
                value = getDescriptor(this.target_, key)?.value
            }
            // delete prop (do first, may fail)
            // 删除属性
            if (proxyTrap) {
                if (!Reflect.deleteProperty(this.target_, key)) {
                    return false
                }
            } else {
                delete this.target_[key]
            }
            // Allow re-annotating this field
            if (__DEV__) {
                // 删除已注解的记录,允许被重新注解
                delete this.appliedAnnotations_![key]
            }
            // Clear observable
            if (observable) {
                // 删除可观察对象
                this.values_.delete(key)
                // for computed, value is undefined
                if (observable instanceof ObservableValue) {
                    value = observable.value_
                }
                // Notify: autorun(() => obj[key]), see #1796
                // 传播修改
                propagateChanged(observable)
            }
            // Notify "keys/entries/values" observers
            this.keysAtom_.reportChanged()

            // Notify "has" observers
            // "in" as it may still exist in proto
            this.pendingKeys_?.get(key)?.set(key in this.target_)

            // Notify spies/listeners
            if (notify || notifySpy) {
                const change: IObjectDidChange = {
                    type: REMOVE,
                    observableKind: "object",
                    object: this.proxy_ || this.target_,
                    debugObjectName: this.name_,
                    oldValue: value,
                    name: key
                }
                if (__DEV__ && notifySpy) {
                    spyReportStart(change!)
                }
                if (notify) {
                    notifyListeners(this, change)
                }
                if (__DEV__ && notifySpy) {
                    spyReportEnd()
                }
            }
        } finally {
            endBatch()
        }
        return true
    }

    /**
     * 观察对象,添加监听
     * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
     * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
     * for callback details
     * @param callback 监听函数
     * @param fireImmediately
     * @returns 取消监听方法
     */
    observe_(callback: (changes: IObjectDidChange) => void, fireImmediately?: boolean): Lambda {
        if (__DEV__ && fireImmediately === true) {
            die("`observe` doesn't support the fire immediately property for observable objects.")
        }
        return registerListener(this, callback)
    }

    /**
     * 注册拦截
     * @param handler 拦截后触发方法
     * @returns 取消该拦截方法
     */
    intercept_(handler): Lambda {
        return registerInterceptor(this, handler)
    }

    /**
     * 通知属性更改
     * @param key 更改的键
     * @param value 更改的值
     */
    notifyPropertyAddition_(key: PropertyKey, value: any) {
        const notify = hasListeners(this)
        const notifySpy = __DEV__ && isSpyEnabled()
        if (notify || notifySpy) {
            // 有局部监听函数或有全局监听
            // 组装更改信息
            const change: IObjectDidChange | null =
                notify || notifySpy
                    ? ({
                          type: ADD,
                          observableKind: "object",
                          debugObjectName: this.name_,
                          object: this.proxy_ || this.target_,
                          name: key,
                          newValue: value
                      } as const)
                    : null

            if (__DEV__ && notifySpy) {
                spyReportStart(change!)
            }
            if (notify) {
                // 当前可观察对象有监听者,通知监听者变化
                notifyListeners(this, change)
            }
            if (__DEV__ && notifySpy) {
                spyReportEnd()
            }
        }

        this.pendingKeys_?.get(key)?.set(true)

        // Notify "keys/entries/values" observers
        this.keysAtom_.reportChanged()
    }

    /**
     * @returns 所有key值,包括不可枚举的symbol键
     */
    ownKeys_(): ArrayLike<string | symbol> {
        this.keysAtom_.reportObserved()
        return ownKeys(this.target_)
    }

    /**
     * @returns key值
     */
    keys_(): PropertyKey[] {
        // Returns enumerable && own, but unfortunately keysAtom will report on ANY key change.
        // There is no way to distinguish between Object.keys(object) and Reflect.ownKeys(object) - both are handled by ownKeys trap.
        // We can either over-report in Object.keys(object) or under-report in Reflect.ownKeys(object)
        // We choose to over-report in Object.keys(object), because:
        // - typically it's used with simple data objects
        // - when symbolic/non-enumerable keys are relevant Reflect.ownKeys works as expected
        this.keysAtom_.reportObserved()
        return Object.keys(this.target_)
    }
}

export interface IIsObservableObject {
    $mobx: ObservableObjectAdministration
}

/**
 * 创建可观察对象,为target添加管理器
 * @param target 目标
 * @param options 创建可观察对象的配置
 * @returns
 */
export function asObservableObject(
    target: any,
    options?: CreateObservableOptions
): IIsObservableObject {
    if (__DEV__ && options && isObservableObject(target)) {
        // 如果已经是可观察的对象,则不能有option
        die(`Options can't be provided for already observable objects.`)
    }

    if (hasProp(target, $mobx)) {
        // 已有管理器
        if (__DEV__ && !(getAdministration(target) instanceof ObservableObjectAdministration)) {
            // 如果已有的管理器,且管理器实例不是ObservableObjectAdministration构造来的
            die(
                `Cannot convert '${getDebugName(target)}' into observable object:` +
                    `\nThe target is already observable of different type.` +
                    `\nExtending builtins is not supported.`
            )
        }
        // 直接返回该管理器
        return target
    }

    if (__DEV__ && !Object.isExtensible(target)) {
        // 不可扩展的对象不能observable
        die("Cannot make the designated object observable; it is not extensible")
    }

    // name为调试名称,优先取options中的name,在打印日志时展示名称
    const name =
        options?.name ??
        (__DEV__
            ? `${
                  isPlainObject(target) ? "ObservableObject" : target.constructor.name
              }@${getNextId()}`
            : "ObservableObject")

    // 创建一个管理器
    const adm = new ObservableObjectAdministration(
        target,
        new Map(),
        String(name),
        getAnnotationFromOptions(options) // 根据options创建注解
    )

    // 在target上挂刚创建完成的管理器,key为symbol(mobx adm)
    addHiddenProp(target, $mobx, adm)

    return target
}

/**
 * 返回一个函数,用于判断目标实例是否是ObservableObjectAdministration实例
 */
const isObservableObjectAdministration = createInstanceofPredicate(
    "ObservableObjectAdministration",
    ObservableObjectAdministration
)

/**
 * 获取一个围绕 [key] 的装饰器,可以缓存在装饰器缓存中,就近取缓存内的装饰器,没有则创建并缓存
 * @param key
 * @returns
 */
function getCachedObservablePropDescriptor(key) {
    return (
        descriptorCache[key] ||
        (descriptorCache[key] = {
            get() {
                return this[$mobx].getObservablePropValue_(key)
            },
            set(value) {
                return this[$mobx].setObservablePropValue_(key, value)
            }
        })
    )
}

/**
 * 判断目标是否是可观察的对象
 * @param thing 目标变量
 * @returns
 */
export function isObservableObject(thing: any): boolean {
    if (isObject(thing)) {
        // 该对象上的adm是否是ObservableObjectAdministration的实例
        return isObservableObjectAdministration((thing as any)[$mobx])
    }
    return false
}

/**
 * 记录注解被添加@@TODO: 不在子属性中重复添加注解?
 * @param adm 管理器
 * @param annotation 注解
 * @param key
 */
export function recordAnnotationApplied(
    adm: ObservableObjectAdministration,
    annotation: Annotation,
    key: PropertyKey
) {
    if (__DEV__) {
        adm.appliedAnnotations_![key] = annotation
    }
    // Remove applied decorator annotation so we don't try to apply it again in subclass constructor
    // 去掉该值,表示不再需要在子类中重复为他执行添加注解操作
    delete adm.target_[storedAnnotationsSymbol]?.[key]
}

/**
 * 断言是否可以注解(注解类型是否正确,将要注解(非override)的值是否已经被注解了)
 * @param adm 管理器
 * @param annotation 注解
 * @param key 目标key
 */
function assertAnnotable(
    adm: ObservableObjectAdministration,
    annotation: Annotation,
    key: PropertyKey
) {
    // Valid annotation
    if (__DEV__ && !isAnnotation(annotation)) {
        die(`Cannot annotate '${adm.name_}.${key.toString()}': Invalid annotation.`)
    }

    /*
    // Configurable, not sealed, not frozen
    // Possibly not needed, just a little better error then the one thrown by engine.
    // Cases where this would be useful the most (subclass field initializer) are not interceptable by this.
    if (__DEV__) {
        const configurable = getDescriptor(adm.target_, key)?.configurable
        const frozen = Object.isFrozen(adm.target_)
        const sealed = Object.isSealed(adm.target_)
        if (!configurable || frozen || sealed) {
            const fieldName = `${adm.name_}.${key.toString()}`
            const requestedAnnotationType = annotation.annotationType_
            let error = `Cannot apply '${requestedAnnotationType}' to '${fieldName}':`
            if (frozen) {
                error += `\nObject is frozen.`
            }
            if (sealed) {
                error += `\nObject is sealed.`
            }
            if (!configurable) {
                error += `\nproperty is not configurable.`
                // Mention only if caused by us to avoid confusion
                if (hasProp(adm.appliedAnnotations!, key)) {
                    error += `\nTo prevent accidental re-definition of a field by a subclass, `
                    error += `all annotated fields of non-plain objects (classes) are not configurable.`
                }
            }
            die(error)
        }
    }
    */

    // Not annotated
    if (__DEV__ && !isOverride(annotation) && hasProp(adm.appliedAnnotations_!, key)) {
        const fieldName = `${adm.name_}.${key.toString()}`
        const currentAnnotationType = adm.appliedAnnotations_![key].annotationType_
        const requestedAnnotationType = annotation.annotationType_
        die(
            `Cannot apply '${requestedAnnotationType}' to '${fieldName}':` +
                `\nThe field is already annotated with '${currentAnnotationType}'.` +
                `\nRe-annotating fields is not allowed.` +
                `\nUse 'override' annotation for methods overriden by subclass.`
        )
    }
}
