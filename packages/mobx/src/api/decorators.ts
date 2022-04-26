import { Annotation, addHiddenProp, AnnotationsMap, hasProp, die, isOverride } from "../internal"

export const storedAnnotationsSymbol = Symbol("mobx-stored-annotations")

/**
 * Creates a function that acts as
 * - decorator
 * - annotation object
 */
/**
 * 创建一个函数作为decorator和注解对象
 * @param annotation 注解
 * @returns
 */
export function createDecoratorAnnotation(annotation: Annotation): PropertyDecorator & Annotation {
    function decorator(target, property) {
        storeAnnotation(target, property, annotation)
    }
    return Object.assign(decorator, annotation)
}

/**
 * Stores annotation to prototype,
 * so it can be inspected later by `makeObservable` called from constructor
 */
/**
 * 为目标储存注解
 * @param prototype 目标
 * @param key 要储存的目标键
 * @param annotation 注解
 */
export function storeAnnotation(prototype: any, key: PropertyKey, annotation: Annotation) {
    if (!hasProp(prototype, storedAnnotationsSymbol)) {
        if (prototype[storedAnnotationsSymbol]) {
            console.log("截取到继承的意义========", prototype[storedAnnotationsSymbol], prototype)
        }
        // 目标上没有[storedAnnotationsSymbol]属性
        // 为目标加上不可枚举的属性
        addHiddenProp(prototype, storedAnnotationsSymbol, {
            // Inherit annotations  (这里的继承有什么意义,什么情形下会有继承)
            ...prototype[storedAnnotationsSymbol]
        })
    }
    // @override must override something
    // override注解一定要覆盖一定的东西
    if (__DEV__ && isOverride(annotation) && !hasProp(prototype[storedAnnotationsSymbol], key)) {
        const fieldName = `${prototype.constructor.name}.prototype.${key.toString()}`
        die(
            `'${fieldName}' is decorated with 'override', ` +
                `but no such decorated member was found on prototype.`
        )
    }
    // Cannot re-decorate
    // 已有注解的值不能再使用除override之外的的注解
    assertNotDecorated(prototype, annotation, key)

    // Ignore override
    if (!isOverride(annotation)) {
        // 不是override的注解,把注解值加到对象的注解对象映射上
        prototype[storedAnnotationsSymbol][key] = annotation
    }
}

function assertNotDecorated(prototype: object, annotation: Annotation, key: PropertyKey) {
    if (__DEV__ && !isOverride(annotation) && hasProp(prototype[storedAnnotationsSymbol], key)) {
        // 不是override并且已经有过注解了
        const fieldName = `${prototype.constructor.name}.prototype.${key.toString()}`
        const currentAnnotationType = prototype[storedAnnotationsSymbol][key].annotationType_
        const requestedAnnotationType = annotation.annotationType_
        die(
            `Cannot apply '@${requestedAnnotationType}' to '${fieldName}':` +
                `\nThe field is already decorated with '@${currentAnnotationType}'.` +
                `\nRe-decorating fields is not allowed.` +
                `\nUse '@override' decorator for methods overriden by subclass.`
        )
    }
}

/**
 * Collects annotations from prototypes and stores them on target (instance)
 */
export function collectStoredAnnotations(target): AnnotationsMap<any, any> {
    if (!hasProp(target, storedAnnotationsSymbol)) {
        if (__DEV__ && !target[storedAnnotationsSymbol]) {
            die(
                `No annotations were passed to makeObservable, but no decorated members have been found either`
            )
        }
        // We need a copy as we will remove annotation from the list once it's applied.
        addHiddenProp(target, storedAnnotationsSymbol, { ...target[storedAnnotationsSymbol] })
    }
    return target[storedAnnotationsSymbol]
}
