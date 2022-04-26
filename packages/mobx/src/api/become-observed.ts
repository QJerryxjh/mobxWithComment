import {
    IComputedValue,
    IObservable,
    IObservableArray,
    Lambda,
    ObservableMap,
    getAtom,
    ObservableSet,
    isFunction,
    IObservableValue
} from "../internal"

const ON_BECOME_OBSERVED = "onBO"
const ON_BECOME_UNOBSERVED = "onBUO"

export function onBecomeObserved(
    value:
        | IObservable
        | IComputedValue<any>
        | IObservableArray<any>
        | ObservableMap<any, any>
        | ObservableSet<any>
        | IObservableValue<any>,
    listener: Lambda
): Lambda
export function onBecomeObserved<K, V = any>(
    value: ObservableMap<K, V> | Object,
    property: K,
    listener: Lambda
): Lambda
// 原子变得可观察添加钩子函数
export function onBecomeObserved(thing, arg2, arg3?): Lambda {
    return interceptHook(ON_BECOME_OBSERVED, thing, arg2, arg3)
}

export function onBecomeUnobserved(
    value:
        | IObservable
        | IComputedValue<any>
        | IObservableArray<any>
        | ObservableMap<any, any>
        | ObservableSet<any>
        | IObservableValue<any>,
    listener: Lambda
): Lambda
export function onBecomeUnobserved<K, V = any>(
    value: ObservableMap<K, V> | Object,
    property: K,
    listener: Lambda
): Lambda
// 原子变得不可观察添加钩子函数
export function onBecomeUnobserved(thing, arg2, arg3?): Lambda {
    return interceptHook(ON_BECOME_UNOBSERVED, thing, arg2, arg3)
}

/**
 * 为钩子添加监听函数,并且返回删除该监听函数的方法
 * @param hook 钩子类型
 * @param thing atom实例
 * @param arg2 属性名 | 钩子触发的监听函数
 * @param arg3 钩子触发的监听函数
 * @returns 删除此监听函数
 */
function interceptHook(hook: "onBO" | "onBUO", thing, arg2, arg3) {
    const atom: IObservable =
        typeof arg3 === "function" ? getAtom(thing, arg2) : (getAtom(thing) as any)
    const cb = isFunction(arg3) ? arg3 : arg2
    const listenersKey = `${hook}L` as "onBOL" | "onBUOL"

    if (atom[listenersKey]) {
        atom[listenersKey]!.add(cb)
    } else {
        atom[listenersKey] = new Set<Lambda>([cb])
    }

    return function () {
        const hookListeners = atom[listenersKey]
        if (hookListeners) {
            hookListeners.delete(cb)
            if (hookListeners.size === 0) {
                delete atom[listenersKey]
            }
        }
    }
}
