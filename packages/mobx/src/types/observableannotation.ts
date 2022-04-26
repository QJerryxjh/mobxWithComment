import {
    ObservableObjectAdministration,
    deepEnhancer,
    die,
    Annotation,
    MakeResult
} from "../internal"

/**
 * 创建观察注解
 * @param name 注解类型(deep,ref,shallow)
 * @param options
 * @returns
 */
export function createObservableAnnotation(name: string, options?: object): Annotation {
    return {
        annotationType_: name,
        options_: options,
        make_,
        extend_
    }
}

function make_(
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor
): MakeResult {
    // 如果被拦截器拦截取消,返回取消,否则返回跳过
    return this.extend_(adm, key, descriptor, false) === null ? MakeResult.Cancel : MakeResult.Break
}

function extend_(
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
    proxyTrap: boolean
): boolean | null {
    assertObservableDescriptor(adm, this, key, descriptor)
    return adm.defineObservableProperty_(
        key,
        descriptor.value,
        this.options_?.enhancer ?? deepEnhancer, // 没有劫持器,则默认为深度劫持
        proxyTrap
    )
}

/**
 * 断言是否可以添加可观察注解,可观察注解不能赋予在get/set属性上
 * @param adm
 * @param param1
 * @param key
 * @param descriptor
 */
function assertObservableDescriptor(
    adm: ObservableObjectAdministration,
    { annotationType_ }: Annotation,
    key: PropertyKey,
    descriptor: PropertyDescriptor
) {
    if (__DEV__ && !("value" in descriptor)) {
        // 有get和set的属性,属性描述符没有 'value'字段
        die(
            `Cannot apply '${annotationType_}' to '${adm.name_}.${key.toString()}':` +
                `\n'${annotationType_}' cannot be used on getter/setter properties`
        )
    }
}
