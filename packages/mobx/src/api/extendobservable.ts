import {
    CreateObservableOptions,
    isObservableMap,
    AnnotationsMap,
    startBatch,
    endBatch,
    asObservableObject,
    isPlainObject,
    ObservableObjectAdministration,
    isObservable,
    die,
    getOwnPropertyDescriptors,
    $mobx,
    ownKeys
} from "../internal"

/**
 * 为元素子集都添加可观察
 * @param target 在observable.object调用时为管理对象,在makeAutoObservable调用时为实例值
 * @param properties 原对象
 * @param annotations 注解
 * @param options 配置
 * @returns
 */
export function extendObservable<A extends Object, B extends Object>(
    target: A,
    properties: B,
    annotations?: AnnotationsMap<B, never>,
    options?: CreateObservableOptions
): A & B {
    if (__DEV__) {
        if (arguments.length > 4) {
            die("'extendObservable' expected 2-4 arguments")
        }
        if (typeof target !== "object") {
            die("'extendObservable' expects an object as first argument")
        }
        if (isObservableMap(target)) {
            die("'extendObservable' should not be used on maps, use map.merge instead")
        }
        if (!isPlainObject(properties)) {
            die(`'extendObservable' only accepts plain objects as second argument`)
        }
        if (isObservable(properties) || isObservable(annotations)) {
            die(`Extending an object with another observable (object) is not supported`)
        }
    }
    // Pull descriptors first, so we don't have to deal with props added by administration ($mobx)
    // 返回对象所有键的装饰
    const descriptors = getOwnPropertyDescriptors(properties)

    // target有管理器则获取此管理器,没有则创建一个管理器返回
    const adm: ObservableObjectAdministration = asObservableObject(target, options)[$mobx]
    startBatch()
    try {
        // 遍历对象的key值,为管理器添加扩展
        ownKeys(descriptors).forEach(key => {
            adm.extend_(
                key,
                descriptors[key as any],
                // must pass "undefined" for { key: undefined }
                !annotations ? true : key in annotations ? annotations[key] : true
            )
        })
    } finally {
        endBatch()
    }
    return target as any
}
