import { IDerivation, IObservable, Reaction, die, getGlobal } from "../internal"
import { ComputedValue } from "./computedvalue"

/**
 * 所含字段在重置时依然会被保留,仅在测试环境中使用
 */
const persistentKeys: (keyof MobXGlobals)[] = [
    "mobxGuid",
    "spyListeners",
    "enforceActions",
    "computedRequiresReaction",
    "reactionRequiresObservable",
    "observableRequiresReaction",
    "allowStateReads",
    "disableErrorBoundaries",
    "runId",
    "UNCHANGED",
    "useProxies"
]

export type IUNCHANGED = {}

export class MobXGlobals {
    /**
     * MobXGlobals version.
     * MobX compatiblity with other versions loaded in memory as long as this version matches.
     * It indicates that the global state still stores similar information
     *
     * N.B: this version is unrelated to the package version of MobX, and is only the version of the
     * internal state storage of MobX, and can be the same across many different package versions
     */
    version = 6

    /**
     * globally unique token to signal unchanged
     */
    /**
     * 全局唯一标志,未修改
     */
    UNCHANGED: IUNCHANGED = {}

    /**
     * Currently running derivation
     */
    /**
     * 当前正在运行的derivation
     */
    trackingDerivation: IDerivation | null = null

    /**
     * Currently running reaction. This determines if we currently have a reactive context.
     * (Tracking derivation is also set for temporal tracking of computed values inside actions,
     * but trackingReaction can only be set by a form of Reaction)
     */
    trackingContext: Reaction | ComputedValue<any> | null = null

    /**
     * Each time a derivation is tracked, it is assigned a unique run-id
     */
    runId = 0

    /**
     * 'guid' for general purpose. Will be persisted amongst resets.
     */
    mobxGuid = 0

    /**
     * Are we in a batch block? (and how many of them)
     */
    inBatch: number = 0

    /**
     * Observables that don't have observers anymore, and are about to be
     * suspended, unless somebody else accesses it in the same batch
     *
     * @type {IObservable[]}
     */
    pendingUnobservations: IObservable[] = []

    /**
     * List of scheduled, not yet executed, reactions.
     */
    pendingReactions: Reaction[] = []

    /**
     * Are we currently processing reactions?
     */
    isRunningReactions = false

    /**
     * Is it allowed to change observables at this point?
     * In general, MobX doesn't allow that when running computations and React.render.
     * To ensure that those functions stay pure.
     */
    allowStateChanges = false

    /**
     * Is it allowed to read observables at this point?
     * Used to hold the state needed for `observableRequiresReaction`
     */
    allowStateReads = true

    /**
     * If strict mode is enabled, state changes are by default not allowed
     */
    enforceActions: boolean | "always" = true

    /**
     * Spy callbacks
     */
    spyListeners: { (change: any): void }[] = []

    /**
     * Globally attached error handlers that react specifically to errors in reactions
     */
    /**
     * reaction执行发生错误时的错误回调
     */
    globalReactionErrorHandlers: ((error: any, derivation: IDerivation) => void)[] = []

    /**
     * Warn if computed values are accessed outside a reactive context
     */
    computedRequiresReaction = false

    /**
     * (Experimental)
     * Warn if you try to create to derivation / reactive context without accessing any observable.
     */
    reactionRequiresObservable = false

    /**
     * (Experimental)
     * Warn if observables are accessed outside a reactive context
     */
    observableRequiresReaction = false

    /*
     * Don't catch and rethrow exceptions. This is useful for inspecting the state of
     * the stack when an exception occurs while debugging.
     */
    disableErrorBoundaries = false

    /*
     * If true, we are already handling an exception in an action. Any errors in reactions should be suppressed, as
     * they are not the cause, see: https://github.com/mobxjs/mobx/issues/1836
     */
    suppressReactionErrors = false

    /**
     * 根据configure和环境是否支持proxy来确定是否支持proxy,默认为true
     */
    useProxies = true
    /*
     * print warnings about code that would fail if proxies weren't available
     */
    /**
     * proxy不可用的时候是否要打警告
     */
    verifyProxies = false

    /**
     * False forces all object's descriptors to
     * writable: true
     * configurable: true
     */
    safeDescriptors = true
}

let canMergeGlobalState = true
let isolateCalled = false

export let globalState: MobXGlobals = (function () {
    let global = getGlobal() // 浏览器 -> window
    if (global.__mobxInstanceCount > 0 && !global.__mobxGlobals) {
        // 有mobx实例,但是没有mobx设置的全局说明信息
        canMergeGlobalState = false
    }
    if (global.__mobxGlobals && global.__mobxGlobals.version !== new MobXGlobals().version) {
        // 有全局说明信息但是信息指明的版本与当前使用版本不一致
        canMergeGlobalState = false
    }

    if (!canMergeGlobalState) {
        // 存在其他实例,并且版本不兼容,不能合并
        // Because this is a IIFE we need to let isolateCalled a chance to change
        // so we run it after the event loop completed at least 1 iteration
        // IIFE调用取值isolateCalled为初始值,初始化配置未被执行,为保证在取值在初始化配置之后,使用定时器
        setTimeout(() => {
            if (!isolateCalled) {
                // 不能合并,且配置设置了不分离
                die(35)
            }
        }, 1)
        return new MobXGlobals()
    } else if (global.__mobxGlobals) {
        // __mobxGlobals存在并且version相同
        global.__mobxInstanceCount += 1
        if (!global.__mobxGlobals.UNCHANGED) {
            global.__mobxGlobals.UNCHANGED = {}
        } // make merge backward compatible
        return global.__mobxGlobals
    } else {
        // 没有__mobxGlobals,且__mobxInstanceCount小于等于0
        global.__mobxInstanceCount = 1
        return (global.__mobxGlobals = new MobXGlobals())
    }
})()

console.log(globalState)

export function isolateGlobalState() {
    if (
        globalState.pendingReactions.length ||
        globalState.inBatch ||
        globalState.isRunningReactions
    ) {
        // 全局配置调用时间必须在更新调度功能开始之前
        die(36)
    }
    isolateCalled = true
    if (canMergeGlobalState) {
        // 如果能合并全局mobx
        let global = getGlobal()
        if (--global.__mobxInstanceCount === 0) {
            // 如果当前没有待合并的mobx,则把__mobxGlobals信息清空
            global.__mobxGlobals = undefined
        }
        globalState = new MobXGlobals()
    }
}

export function getGlobalState(): any {
    return globalState
}

/**
 * For testing purposes only; this will break the internal state of existing observables,
 * but can be used to get back at a stable state after throwing errors
 */
/**
 * 仅用于测试,用于在捕获错误的时候回退state
 */
export function resetGlobalState() {
    const defaultGlobals = new MobXGlobals()
    for (let key in defaultGlobals) {
        if (persistentKeys.indexOf(key as any) === -1) {
            globalState[key] = defaultGlobals[key]
        }
    }
    globalState.allowStateChanges = !globalState.enforceActions
}
