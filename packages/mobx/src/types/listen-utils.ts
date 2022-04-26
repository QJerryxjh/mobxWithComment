import { Lambda, once, untrackedEnd, untrackedStart } from "../internal"

export interface IListenable {
    changeListeners_: Function[] | undefined
}

/**
 * 是否有监听修改事件
 * @param listenable 可监听对象
 * @returns
 */
export function hasListeners(listenable: IListenable) {
    return listenable.changeListeners_ !== undefined && listenable.changeListeners_.length > 0
}

/**
 * 注册监听
 * @param listenable 可监听对象
 * @param handler 监听处理函数
 * @returns 取消监听函数
 */
export function registerListener(listenable: IListenable, handler: Function): Lambda {
    const listeners = listenable.changeListeners_ || (listenable.changeListeners_ = [])
    listeners.push(handler)
    return once(() => {
        const idx = listeners.indexOf(handler)
        if (idx !== -1) {
            listeners.splice(idx, 1)
        }
    })
}

/**
 * 通知观察者更改内容
 * @param listenable 可监听对象
 * @param change 更改内容信息对象
 * @returns
 */
export function notifyListeners<T>(listenable: IListenable, change: T) {
    const prevU = untrackedStart()
    let listeners = listenable.changeListeners_
    if (!listeners) {
        return
    }
    listeners = listeners.slice()
    for (let i = 0, l = listeners.length; i < l; i++) {
        listeners[i](change)
    }
    untrackedEnd(prevU)
}
