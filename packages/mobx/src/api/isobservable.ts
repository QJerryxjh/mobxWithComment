import {
    $mobx,
    isAtom,
    isComputedValue,
    isObservableArray,
    isObservableMap,
    isObservableObject,
    isReaction,
    die,
    isStringish
} from "../internal"

/**
 * 是否是可观察的
 * @param value 对象
 * @param property 属性
 */
function _isObservable(value, property?: PropertyKey): boolean {
    if (!value) {
        return false
    }
    if (property !== undefined) {
        // 判断对象上的某一个属性是否是可观察的
        if (__DEV__ && (isObservableMap(value) || isObservableArray(value))) {
            // 不可用此方法来查看可观察map和可观察数组的属性
            return die(
                "isObservable(object, propertyName) is not supported for arrays and maps. Use map.has or array.length instead."
            )
        }
        if (isObservableObject(value)) {
            // 如果对象是可观察的,查看该对象上的管理器的values_上是否有存在以该属性名的为属性的值
            return value[$mobx].values_.has(property)
        }
        // 其他情况视为否
        return false
    }
    // 仅查看当前对象是否是可观察的
    // 当满足: 是可观察对象;对象上有管理器;是atom;是reaction;是computedValue; 中的其中一项时,则视为可观察
    // For first check, see #701
    return (
        isObservableObject(value) ||
        !!value[$mobx] ||
        isAtom(value) ||
        isReaction(value) ||
        isComputedValue(value)
    )
}

/**
 * 是否是可观察的
 * @param value 需要判断的变量
 * @returns
 */
export function isObservable(value: any): boolean {
    if (__DEV__ && arguments.length !== 1) {
        die(
            `isObservable expects only 1 argument. Use isObservableProp to inspect the observability of a property`
        )
    }
    return _isObservable(value)
}

/**
 * 是否是可观察的,需满足value和value[propName]都是可观察
 * @param value 载体对象
 * @param propName 对象上的key
 * @returns
 */
export function isObservableProp(value: any, propName: PropertyKey): boolean {
    if (__DEV__ && !isStringish(propName)) {
        return die(`expected a property name as second argument`)
    }
    return _isObservable(value, propName)
}
