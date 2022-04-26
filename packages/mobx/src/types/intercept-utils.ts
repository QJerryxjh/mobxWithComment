import { Lambda, once, untrackedEnd, untrackedStart, die } from "../internal"

export type IInterceptor<T> = (change: T) => T | null

export interface IInterceptable<T> {
    interceptors_: IInterceptor<T>[] | undefined
}

export function hasInterceptors(interceptable: IInterceptable<any>) {
    return interceptable.interceptors_ !== undefined && interceptable.interceptors_.length > 0
}

/**
 * 注册拦截函数
 * @param interceptable 可拦截对象
 * @param handler 拦截处理函数
 * @returns 取消拦截方法
 */
export function registerInterceptor<T>(
    interceptable: IInterceptable<T>,
    handler: IInterceptor<T>
): Lambda {
    const interceptors = interceptable.interceptors_ || (interceptable.interceptors_ = [])
    interceptors.push(handler)
    return once(() => {
        const idx = interceptors.indexOf(handler)
        if (idx !== -1) {
            interceptors.splice(idx, 1)
        }
    })
}

export function interceptChange<T>(
    interceptable: IInterceptable<T | null>,
    change: T | null
): T | null {
    const prevU = untrackedStart()
    try {
        // Interceptor can modify the array, copy it to avoid concurrent modification, see #1950
        const interceptors = [...(interceptable.interceptors_ || [])]
        for (let i = 0, l = interceptors.length; i < l; i++) {
            change = interceptors[i](change)
            if (change && !(change as any).type) {
                // change有值但是没有type,报错: Intercept handlers 需要不返回值,或者返回的值里有type
                die(14)
            }
            if (!change) {
                // 如果change为空,则跳出
                break
            }
        }
        return change
    } finally {
        untrackedEnd(prevU)
    }
}
