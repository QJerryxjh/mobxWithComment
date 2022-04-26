import {
    $mobx,
    IIsObservableObject,
    ObservableObjectAdministration,
    warnAboutProxyRequirement,
    assertProxies,
    die,
    isStringish,
    globalState,
    CreateObservableOptions,
    asObservableObject
} from "../internal"

function getAdm(target): ObservableObjectAdministration {
    return target[$mobx]
}

// Optimization: we don't need the intermediate objects and could have a completely custom administration for DynamicObjects,
// and skip either the internal values map, or the base object with its property descriptors!
const objectProxyTraps: ProxyHandler<any> = {
    /**
     * 判断target.adm上是否有key为name的值
     * @param target 目标
     * @param name key
     * @returns
     */
    has(target: IIsObservableObject, name: PropertyKey): boolean {
        if (__DEV__ && globalState.trackingDerivation) {
            // 定义useProxy为可用时使用,此时预知环境为es5,但是不支持in语法
            warnAboutProxyRequirement(
                "detect new properties using the 'in' operator. Use 'has' from 'mobx' instead."
            )
        }
        return getAdm(target).has_(name)
    },
    /**
     * 返回target.adm[name]值
     */
    get(target: IIsObservableObject, name: PropertyKey): any {
        return getAdm(target).get_(name)
    },
    /**
     * 为目标元素设置属性值
     * @param target 目标元素
     * @param name 目标属性
     * @param value 新值
     * @returns
     */
    set(target: IIsObservableObject, name: PropertyKey, value: any): boolean {
        if (!isStringish(name)) {
            return false
        }
        if (__DEV__ && !getAdm(target).values_.has(name)) {
            warnAboutProxyRequirement(
                "add a new observable property through direct assignment. Use 'set' from 'mobx' instead."
            )
        }
        // null (intercepted) -> true (success)
        return getAdm(target).set_(name, value, true) ?? true
    },
    /**
     * 删除目标元素上指定的属性
     * @param target 目标元素
     * @param name 属性名
     * @returns
     */
    deleteProperty(target: IIsObservableObject, name: PropertyKey): boolean {
        if (__DEV__) {
            warnAboutProxyRequirement(
                "delete properties from an observable object. Use 'remove' from 'mobx' instead."
            )
        }
        if (!isStringish(name)) {
            return false
        }
        // null (intercepted) -> true (success)
        return getAdm(target).delete_(name, true) ?? true
    },
    defineProperty(
        target: IIsObservableObject,
        name: PropertyKey,
        descriptor: PropertyDescriptor
    ): boolean {
        if (__DEV__) {
            warnAboutProxyRequirement(
                "define property on an observable object. Use 'defineProperty' from 'mobx' instead."
            )
        }
        // null (intercepted) -> true (success)
        // 定义配置,如果被拦截器拦截取消则返回true,成功返回true,定义失败报错返回false
        return getAdm(target).defineProperty_(name, descriptor) ?? true
    },
    ownKeys(target: IIsObservableObject): ArrayLike<string | symbol> {
        if (__DEV__ && globalState.trackingDerivation) {
            warnAboutProxyRequirement(
                "iterate keys to detect added / removed properties. Use 'keys' from 'mobx' instead."
            )
        }
        return getAdm(target).ownKeys_()
    },
    preventExtensions(target) {
        die(13)
    }
}

export function asDynamicObservableObject(
    target: any,
    options?: CreateObservableOptions
): IIsObservableObject {
    // 环境不支持proxy则报错
    assertProxies()
    target = asObservableObject(target, options)
    // 返回target.adm.proxy_,无值时创建一个新的Proxy对象
    // 对target使用proxy劫持,在自己身上挂了一个属性代理自己
    return (target[$mobx].proxy_ ??= new Proxy(target, objectProxyTraps))
}
