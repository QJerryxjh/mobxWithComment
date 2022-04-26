import { globalState, isolateGlobalState, setReactionScheduler } from "../internal"

const NEVER = "never"
const ALWAYS = "always"
const OBSERVED = "observed"
// const IF_AVAILABLE = "ifavailable"

/**
 * 如果需要自定义mobx运行规则,则可导入此函数指定相对于的规则
 * @param options 配置参数
 */
export function configure(options: {
    /**
     * 是否强制state只能在action中更新
     * never: state可在任何地方被更新
     * always: state总是需要在action中被更新,包括创建
     * observed: 被观察的state状态需要在action中更新 default
     */
    enforceActions?: "never" | "always" | "observed"
    /**
     * 访问computed的值是否在正确位置,
     * true: 在action, flow, 被observer包裹的组件 之外获取将会报warning⚠️
     * false: 不报warning   default
     */
    computedRequiresReaction?: boolean
    /**
     * 是否reaction在运行时内部没有访问state
     */
    reactionRequiresObservable?: boolean
    /**
     * 访问observable的state是否在正确位置
     * true: 在action, flow, 被observer包裹的组件 之外获取将会报warning⚠️,包括在computed中使用也会报警告
     * false: 不报warning   default
     */
    observableRequiresReaction?: boolean
    /**
     * 全局的多个mobx(相同版本)共同存在是否要分离开,默认为合并
     */
    isolateGlobalState?: boolean
    /**
     * 开启时,抛出错误的内容将没有mobx所带的前缀信息,前缀信息可体现抛出错误的位置
     * ([mobx] Encountered an uncaught exception that was thrown by a reaction or observer component, in: 'Reaction[Autorun@2]')     Error: Age should not be negative
     * 默认情况下，MobX 会捕获并重新抛出代码中发生的异常，从而确保某个异常中的反应 (reaction) 不会阻止其他可能无关的反应的预定执行。这意味着异常不会传播到原始代码中，因此将无法使用 try/catch 来捕获它们。
     */
    disableErrorBoundaries?: boolean
    /**
     * 描述符,禁止所有对象都是可枚举和可写的
     */
    safeDescriptors?: boolean
    /**
     * 更新调度控制函数,接受f为回调函数,f为更新调度功能,可定制自己的调度功能
     */
    reactionScheduler?: (f: () => void) => void
    /**
     * 是否使用Proxy的api来运行代码
     * always: 总是
     * never: 不使用
     * ifavailable: 存在的时候使用
     */
    useProxies?: "always" | "never" | "ifavailable"
}): void {
    if (options.isolateGlobalState === true) {
        // 手动初始化全局配置信息的时候,把globalState下的的isolateCalled置为true
        isolateGlobalState()
    }
    const { useProxies, enforceActions } = options
    if (useProxies !== undefined) {
        // 是否使用proxy
        globalState.useProxies =
            useProxies === ALWAYS
                ? true
                : useProxies === NEVER
                ? false
                : typeof Proxy !== "undefined"
    }
    if (useProxies === "ifavailable") {
        globalState.verifyProxies = true
    }
    if (enforceActions !== undefined) {
        const ea = enforceActions === ALWAYS ? ALWAYS : enforceActions === OBSERVED
        globalState.enforceActions = ea
        // 只要配置参数enforceActions不为never,allowStateChanges就为false
        globalState.allowStateChanges = ea === true || ea === ALWAYS ? false : true
    }
    ;[
        "computedRequiresReaction",
        "reactionRequiresObservable",
        "observableRequiresReaction",
        "disableErrorBoundaries",
        "safeDescriptors"
    ].forEach(key => {
        if (key in options) {
            globalState[key] = !!options[key]
        }
    })
    globalState.allowStateReads = !globalState.observableRequiresReaction
    if (__DEV__ && globalState.disableErrorBoundaries === true) {
        console.warn(
            "WARNING: Debug feature only. MobX will NOT recover from errors when `disableErrorBoundaries` is enabled."
        )
    }
    if (options.reactionScheduler) {
        // 设置调度器,mobx-react-lite设置的调度器是 unstable_batchedUpdates
        setReactionScheduler(options.reactionScheduler)
    }
}
