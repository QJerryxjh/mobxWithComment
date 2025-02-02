import {
    ObservableObjectAdministration,
    observable,
    Annotation,
    defineProperty,
    createAction,
    globalState,
    flow,
    computed,
    autoAction,
    isGenerator,
    MakeResult
} from "../internal"

const AUTO = "true"

/**
 * 自动注解
 */
export const autoAnnotation: Annotation = createAutoAnnotation()

/**
 * 创建一个自动的注解
 * @param options
 * @returns
 */
export function createAutoAnnotation(options?: object): Annotation {
    return {
        annotationType_: AUTO,
        options_: options,
        make_,
        extend_
    }
}

function make_(
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
    source: object
): MakeResult {
    // getter -> computed
    if (descriptor.get) {
        return computed.make_(adm, key, descriptor, source)
    }
    // lone setter -> action setter
    if (descriptor.set) {
        // TODO make action applicable to setter and delegate to action.make_
        const set = createAction(key.toString(), descriptor.set) as (v: any) => void
        // own
        if (source === adm.target_) {
            return adm.defineProperty_(key, {
                configurable: globalState.safeDescriptors ? adm.isPlainObject_ : true,
                set
            }) === null
                ? MakeResult.Cancel
                : MakeResult.Continue
        }
        // proto
        defineProperty(source, key, {
            configurable: true,
            set
        })
        return MakeResult.Continue
    }
    // function on proto -> autoAction/flow
    if (source !== adm.target_ && typeof descriptor.value === "function") {
        if (isGenerator(descriptor.value)) {
            const flowAnnotation = this.options_?.autoBind ? flow.bound : flow
            return flowAnnotation.make_(adm, key, descriptor, source)
        }
        const actionAnnotation = this.options_?.autoBind ? autoAction.bound : autoAction
        return actionAnnotation.make_(adm, key, descriptor, source)
    }
    // other -> observable
    // Copy props from proto as well, see test:
    // "decorate should work with Object.create"
    let observableAnnotation = this.options_?.deep === false ? observable.ref : observable
    // if function respect autoBind option
    if (typeof descriptor.value === "function" && this.options_?.autoBind) {
        descriptor.value = descriptor.value.bind(adm.proxy_ ?? adm.target_)
    }
    return observableAnnotation.make_(adm, key, descriptor, source)
}

function extend_(
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
    proxyTrap: boolean
): boolean | null {
    // 有get装饰,则为computed,getter -> computed
    if (descriptor.get) {
        return computed.extend_(adm, key, descriptor, proxyTrap)
    }
    // 有set装饰,则为action lone setter -> action setter
    if (descriptor.set) {
        // TODO make action applicable to setter and delegate to action.extend_
        return adm.defineProperty_(
            key,
            {
                configurable: globalState.safeDescriptors ? adm.isPlainObject_ : true,
                set: createAction(key.toString(), descriptor.set) as (v: any) => void
            },
            proxyTrap
        )
    }
    // other -> observable
    // 如果值是函数并且option中autoBind为true,则绑定this; if function respect autoBind option
    if (typeof descriptor.value === "function" && this.options_?.autoBind) {
        descriptor.value = descriptor.value.bind(adm.proxy_ ?? adm.target_)
    }
    let observableAnnotation = this.options_?.deep === false ? observable.ref : observable
    // 注解对应key的属性
    return observableAnnotation.extend_(adm, key, descriptor, proxyTrap)
}
