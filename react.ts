/**
 * 手写React Fiber @luodongseu
 *
 * 1. Fiber是什么？
 * Fiber是React16对diff算法做的一次重构，为了充分利用浏览器的空闲时间来做diff处理，解决动画、输入等高优先级的
 * 任务被原来的高层级组件树递归diff算法卡顿。Fiber利用新的任务调度算法，模拟了浏览器的requestIdleCallback接口功能，
 * 然后通过把虚拟dom树转换为Fiber树（单链表结构），实现了任务可中断、恢复。
 *
 * 2. Fiber怎么做的？
 * 分为2个阶段：
 * （1）reconcile阶段：该阶段主要负责构造整个Fiber树的effect list链表。先通过深度优先算法将虚拟dom树遍历构造Fiber树，
 * 然后自底向上构建effect list链表。
 * （2）commit阶段：该阶段通过effect list链表构造最新的dom树，进行绘制渲染
 *
 *
 * 3. Fiber的调度器？
 * 利用MessageChannel和requestFrameAnimation模拟实现了requestIdleCallback功能，已rfa的回调时间为帧的开始时间，
 * 动态调整执行任务的帧时长（根据浏览器渲染频率），计算每一帧的结束时间和任务的过期时间，然后通过MessageChannel调度
 * 宏任务进行执行回调函数，并传递当前帧的剩余时长和是否过期标志
 *
 *
 * 4. FiberNode结构
 * - type: Function|String
 * - stateNode: FiberRoot|DomElement|ReactElement
 *
 * - return: FiberNode
 * - child: FiberNode
 * - sibling: FiberNode
 *
 * - effectTag = NoEffect|Placement|Deletion|Update
 * - nextEffect: FiberNode 下一个effect节点
 * - firstEffect: FiberNode 子节点中第一个需要更新的effect
 * - lastEffect: FiberNode 子节点中最后一个需要更新的effect
 *
 * - memorizedState: Object 旧的state
 * - memorizedProps: Object 旧的props内容
 * - pendingProps: Object 新的props内容
 * - updateQueue: UpdateQueue 更新队列：执行setState会存放在这里
 *
 * - expirationTime: number 过期时间
 *
 * - alternate: FiberNode 镜像
 *
 * UpdateQueue结构：
 * - baseState: Object 更新前的状态
 * - firstUpdate: Update
 * - lastUpdate: Update
 * - firstEffect: Update
 * - lastEffect: Update
 *
 * Update结构
 * - tag: UpdateState|ReplaceState|ForceUpdate|CaptureUpdate
 * - payload: Object 更新的参数
 * - callback: Function 回调函数
 * - next: Update 下一个更新的节点
 *
 *
 * 5. Hooks如何实现？
 * Hook链表
 *
 */
import { requestIdleCallback, Deadline } from "./ric";

export interface VNode {
  type: string;
  props: {
    children: any[];
    [k: string]: any;
  };
}

export interface RefNode<T> {
  current: T | null
};

///////// 实现createElement: 由babel调用解析
function createTextNode(text: string): VNode {
  return {
    type: "TEXT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}
function createElement(type: string, props: Object, ...children: any[]): VNode {
  let newProps: any = { ...props };
  // 删除无用的props
  delete newProps['__self'];
  delete newProps['__source'];
  return {
    type: type,
    props: {
      ...newProps,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextNode(child)
      )
    }
  };
}

//// 实现stack reconcile render
function render(node: VNode, container: HTMLElement) {
  if (node.type === "TEXT") {
    // 文本
    let dom = document.createTextNode(node.props.nodeValue);
    container.appendChild(dom);
  } else {
    let dom: HTMLElement;
    const vv = node as VNode;
    if (typeof vv.type === "function") {
    }
    dom = document.createElement(vv.type);

    // 挂在属性到dom（children以外）
    if (vv.props) {
      Object.keys(vv.props)
        .filter((k) => k !== "children")
        .forEach((k) => {
          dom.setAttribute(k, vv.props[k]);
        });

      // 渲染子节点
      if (vv.props.children?.length > 0) {
        Array.from(vv.props.children).forEach((child) => render(child, dom));
      }
    }
    container.appendChild(dom);
  }
}

//////////////////////////////////////////////////////////
/// FIBER
//////////////////////////////////////////////////////////

interface Props {
  children?: VNode[];
  [k: string]: any;
}

type EffectHookCallback = () => () => void | void;

interface Hook<T> {
  id?: any;
  state?: T;
  type: "STATE" | "REDUCER" | "EFFECT" | "LAYOUTEFFECT" | "IMPERATIVEHANDLE" | "CALLBACK" | "MEMO" | "REF";
  deps?: any[];
  created?: boolean;
  create?: EffectHookCallback; // EFFECT | LAYOUTEFFECT  use
  destroy?: () => void; // EFFECT | LAYOUTEFFECT use
  handler?: () => T; // IMPERATIVEHANDLE
  [k: string]: any
}

enum EFFECT_TAG {
  NO_EFFECT,
  REPLACEMENT,
  DELETION,
  UPDATE
}

/// Fiber节点
interface FiberNode {
  type: string | Function;

  // 链表
  return: FiberNode | null;
  sibling: FiberNode | null;
  child: FiberNode | null;
  // 副本
  alternate: FiberNode | null;
  hooks?: Hook<any>[];
  hookIndex?: number,

  // 属性
  props?: Props;

  // dom
  stateNode?: HTMLElement | Text | null;

  // effect
  effectTag?: EFFECT_TAG | null;
  nextEffect?: FiberNode | null;
  firstEffect?: FiberNode | null;
  lastEffect?: FiberNode | null;

  [k: string]: any;
}

// 下一个工作单元
let nextUnitOfWork: FiberNode | null;

// 工作中的Root树
let workInProgressRoot: FiberNode | null;

// 当前的函数fiber
let currentFnFiber: FiberNode | null;

// 当前的根节点
let currentRoot: FiberNode | null;

// 删除节点队列
let deletions: FiberNode[] = [];

// 是否需要重新调和
let shouldRetryReconcile = false;

// 跟节点
let rootContainer: HTMLElement;
let rootProps: Props;

// 全局hooks队列：用于重做reconcile任务时读取（useLayoutEffect）
let globalHookQueue: Hook<any>[] = [];
let globalHookIndex: number = 0;

let domListeners = {};

// 更新dom: 添加属性和事件
function updateDom(
  dom: HTMLElement | Text | null | undefined,
  newProps: Props | null | undefined,
  oldProps: Props | null | undefined
) {
  if (!dom) return;
  if (!newProps && !oldProps) return;
  let _newProps = newProps || {};
  let _oldProps = oldProps || {};

  // 处理文本
  if (dom instanceof Text) {
    dom.nodeValue = _newProps.nodeValue;
    return;
  }

  // 其他
  // 取消不存在新的属性
  Object.keys(_oldProps)
    .filter((k) => k !== "children")
    .forEach((k) => {
      if (k.indexOf("on") === 0) {
        dom.removeEventListener(
          k.substr(2).toLocaleLowerCase(),
          _oldProps[k],
          false
        );
      } else {
        dom.removeAttribute(k);
      }
    });
  // 添加新的属性
  Object.keys(_newProps)
    .filter((k) => k !== "children")
    .forEach((k) => {
      if (k.indexOf("on") === 0) {
        dom.addEventListener(
          k.substr(2).toLocaleLowerCase(),
          _newProps[k],
          false
        );
      } else if (k === 'ref') {
        // 处理ref
        _newProps[k] = _newProps[k] || {};
        _newProps[k].current = dom;
      } else if (k === "style") {
        let styleStr = Object.keys(_newProps[k])
          .map((_p) => {
            let keys: string[] = [];
            let keyChars = `${_p}`.split("");
            keyChars.forEach((c) => {
              if (c.toLocaleUpperCase() === c) {
                keys.push("-", c.toLocaleLowerCase());
              } else {
                keys.push(c);
              }
            });
            let key = keys.join("");
            let kv: string = `${key}:${_newProps[k][_p]}`;
            if (
              ["width", "height", "font-size"].indexOf(key) >= 0 &&
              !kv.endsWith("px")
            ) {
              kv = `${kv}px`;
            }
            return kv;
          })
          .join(";");
        dom.setAttribute(k, styleStr);
      } else {
        dom.setAttribute(k, _newProps[k]);
      }
    });
}

function createDom(fiber: FiberNode) {
  switch (fiber.type) {
    case "TEXT":
      if (!fiber.stateNode) {
        fiber.stateNode = document.createTextNode(fiber.props?.nodeValue);
      }
      break;
    default:
      if (!fiber.stateNode) {
        fiber.stateNode = document.createElement(fiber.type as string);
      }
      break;
  }
}

/// 处理子节点
function reconcileChildren(fiber: FiberNode, children: VNode[]) {
  // 子节点需要构建FiberNode
  // TODO: 删除、 更新操作
  if (!children) return;
  let oldChildFiber: FiberNode | null =
    (fiber.alternate && fiber.alternate.child) || null;
  let previousSibling: FiberNode | null = null;
  if (!oldChildFiber) {
    // 全部新增
    if (children) {
      children.forEach((child) => {
        let newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: null,
          props: child.props,
          effectTag: EFFECT_TAG.REPLACEMENT,
          nextEffect: null
        } as FiberNode;
        if (!previousSibling) {
          fiber.child = newFiber;
        } else {
          previousSibling.sibling = newFiber;
        }
        previousSibling = newFiber;
      });
    }
  } else {
    // 处理
    let index = 0;
    while (index < children.length || oldChildFiber) {
      const child = children[index];
      const sameType =
        child && oldChildFiber && child.type === oldChildFiber?.type;
      let newFiber: FiberNode | null = null;
      if (sameType) {
        // 复用
        newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: oldChildFiber!,
          props: child.props,
          effectTag: currentRoot ? EFFECT_TAG.UPDATE : EFFECT_TAG.REPLACEMENT,
          nextEffect: null,
          stateNode: oldChildFiber!.stateNode,
          hooks: oldChildFiber!.hooks
        };
      } else if (child && oldChildFiber) {
        // 处理类型变了
        newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: null,
          props: child.props,
          effectTag: EFFECT_TAG.REPLACEMENT,
          nextEffect: null
        };
        oldChildFiber.effectTag = EFFECT_TAG.DELETION;
        deletions.push(oldChildFiber);
        // 删除旧节点同时删除所有兄弟节点，保证父亲的子节点顺序
        while (oldChildFiber.sibling) {
          oldChildFiber.sibling.effectTag = EFFECT_TAG.DELETION;
          deletions.push(oldChildFiber.sibling);
          oldChildFiber = oldChildFiber.sibling;
        }
      } else if (child) {
        // 新建
        newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: null,
          props: child.props,
          effectTag: EFFECT_TAG.REPLACEMENT,
          nextEffect: null
        };
      } else if (oldChildFiber) {
        // 删除旧的Fiber
        oldChildFiber.effectTag = EFFECT_TAG.DELETION;
        deletions.push(oldChildFiber);
      }
      if (index < children.length) {
        if (!previousSibling) {
          fiber.child = newFiber;
        } else {
          previousSibling.sibling = newFiber;
        }
        previousSibling = newFiber;
      }
      if (oldChildFiber) {
        oldChildFiber = oldChildFiber.sibling;
      }
      index++;
    }
  }
}

// 创建基本dom
function updateHostDom(fiber: FiberNode) {
  createDom(fiber);
  const children = fiber.props?.children;
  if (children) {
    // @ts-ignore
    reconcileChildren(fiber, Array.isArray(children) ? children : [children]);
  }
}

// 完成commit前的hooks
function completeHooksBeforeCommit() {
  // console.log(':completeHooksBeforeCommit', workInProgressRoot);
  let fiber = workInProgressRoot?.firstEffect;
  while (fiber) {
    if (fiber && fiber.hooks) {
      // IMPERATIVEHANDLE
      fiber.hooks
        .filter((h) => h.type === "IMPERATIVEHANDLE")
        .forEach((hook) => {
          switch (fiber!.effectTag) {
            case EFFECT_TAG.REPLACEMENT:
            case EFFECT_TAG.UPDATE:
              if (hook.ref && !hook.created && hook.handler) {
                hook.ref.current = hook.handler?.();
                hook.created = true;
              }
              break;
            case EFFECT_TAG.DELETION:
              hook.created = false;
              break;
          }
        });

      // LAYOUTEFFECT
      fiber.hooks
        .filter((h) => h.type === "LAYOUTEFFECT")
        .forEach((hook) => {
          switch (fiber!.effectTag) {
            case EFFECT_TAG.REPLACEMENT:
            case EFFECT_TAG.UPDATE:
              if (!hook.created) {
                shouldRetryReconcile = true;
                const destroy = hook?.create?.();
                if (destroy instanceof Function) {
                  hook.destroy = destroy;
                }
                hook.created = true;
              }
              break;
            case EFFECT_TAG.DELETION:
              if (hook.destroy) {
                hook.destroy?.();
                hook.destroy = undefined;
              }
              break;
          }
        });
    }
    fiber = fiber.nextEffect;
  }
}

// 创建函数式组件
function updateFunctionDom(fiber: FiberNode) {
  currentFnFiber = fiber;
  fiber.hookIndex = 0;
  fiber.hooks = [];
  let dom = (fiber.type as Function)(fiber.props);
  reconcileChildren(fiber, [dom]);
}

// 处理节点dom
function beginWork(fiber: FiberNode) {
  if (fiber.type instanceof Function) {
    /// 函数式组件
    updateFunctionDom(fiber);
  } else {
    // 创建dom
    updateHostDom(fiber);
  }
}

// 处理effect list
function completeUnitOfWork(fiber: FiberNode) {
  // 处理return
  let returnFiber = fiber.return;
  if (!returnFiber) {
    return;
  }

  if (!returnFiber.firstEffect) {
    returnFiber.firstEffect = fiber.firstEffect;
  }
  if (fiber.lastEffect) {
    if (returnFiber.lastEffect) {
      returnFiber.lastEffect.nextEffect = fiber.firstEffect;
    }
    returnFiber.lastEffect = fiber.lastEffect;
  }
  if (fiber.effectTag !== EFFECT_TAG.NO_EFFECT) {
    // 挂载自己到队尾
    if (returnFiber.lastEffect) {
      returnFiber.lastEffect.nextEffect = fiber;
    } else {
      returnFiber.firstEffect = fiber;
    }
    returnFiber.lastEffect = fiber;
  }


}

/// 工作：Root是有fiber结构的，其他的子节点初次渲染时没有Fiber结构
function performUnitOfWork(fiber: FiberNode): FiberNode | null {
  beginWork(fiber);

  // 返回下一个任务: 如果有子节点，返回子节点，如果有兄弟节点则返回兄弟节点，否则返回父节点的兄弟节点
  if (fiber.child) {
    return fiber.child;
  }
  // 兄弟节点 -> 父亲的兄弟节点 -> 父亲的父亲的兄弟节点 -> ...
  let nextFiber: FiberNode | null = fiber;
  while (nextFiber) {
    completeUnitOfWork(nextFiber);
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.return;
  }

  return null;
}

/// 提交effect hooks
function commitHooksEffect(fiber: FiberNode) {
  if (fiber.hooks) {
    fiber.hooks
      .filter((h) => h.type === "EFFECT")
      .forEach((hook) => {
        switch (fiber.effectTag) {
          case EFFECT_TAG.REPLACEMENT:
          case EFFECT_TAG.UPDATE:
            if (!hook.created) {
              setTimeout(() => {
                const destroy = hook?.create?.();
                if (destroy instanceof Function) {
                  hook.destroy = destroy;
                }
                hook.created = true;
              });
            }
            break;
          case EFFECT_TAG.DELETION:
            if (hook.destroy) {
              hook.destroy?.();
              hook.destroy = undefined;
            }
            break;
        }
      });
  }
}

/// 第二阶段：提交作业
function commitRoot() {
  // 处理节点删除
  deletions
    .filter((d) => d.return?.effectTag !== EFFECT_TAG.DELETION)
    .forEach((fiber: FiberNode) => {
      commitHooksEffect(fiber);

      // 替换老节点，直接追加
      let parentFiber = fiber.return;
      // 找到可以挂载的父节点
      while (parentFiber && !parentFiber.stateNode) {
        parentFiber = parentFiber.return;
      }

      let dom = fiber.stateNode;
      let childFiber = fiber;
      if (!dom) {
        while (!dom && childFiber.child) {
          dom = childFiber.child.stateNode;
          childFiber = childFiber.child;
        }
      }

      if (fiber.return?.effectTag === EFFECT_TAG.DELETION) {
        return;
      }

      if (dom) {
        parentFiber?.stateNode?.childNodes?.forEach(d => {
          if (d && d === dom) {
            parentFiber?.stateNode?.removeChild(dom);
          }
        })
      }
    });
  deletions = [];

  // 遍历插入或更新
  let workFiber = workInProgressRoot?.firstEffect;
  while (workFiber) {
    // 替换老节点，直接追加
    let parentFiber = workFiber.return;
    // 找到可以挂载的父节点
    while (parentFiber && !parentFiber.stateNode) {
      parentFiber = parentFiber.return;
    }
    if (workFiber.effectTag === EFFECT_TAG.REPLACEMENT && workFiber.stateNode) {
      parentFiber?.stateNode?.appendChild(workFiber.stateNode!);
    } else if (workFiber.effectTag === EFFECT_TAG.DELETION) {
      // 删除老节点
    } else if (workFiber.effectTag === EFFECT_TAG.UPDATE) {
      if (
        workFiber.type === "TEXT"
      ) {
        let newDom = document.createTextNode(workFiber.props?.nodeValue);
        parentFiber?.stateNode?.replaceChild(newDom, workFiber.stateNode!);
        workFiber.stateNode = newDom;
      }
    }

    // hook
    commitHooksEffect(workFiber);

    // 赋值属性
    updateDom(
      workFiber.stateNode,
      workFiber.props,
      workFiber.alternate?.props
    );

    workFiber = workFiber.nextEffect;
  }

  // console.log('::commitRoot workInProgressRoot', workInProgressRoot);

  // 重置workInProogressFiber
  currentRoot = workInProgressRoot;
  workInProgressRoot = null;
  globalHookQueue = [];
  globalHookIndex = 0;
}

/// 循环工作
function workLoop(deadline: Deadline) {
  while (nextUnitOfWork && deadline.timeRemaining() > 0) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }

  completeHooksBeforeCommit();

  // 提交: 当reconcile准备完，且未完成提交时
  if (!nextUnitOfWork && workInProgressRoot) {
    commitRoot();
  }
  if (nextUnitOfWork) requestIdleCallback(workLoop);
}

/// Fiber 渲染
function fiberRender(node: VNode, container: HTMLElement) {
  // requestIdleCallback(workLoop);
  rootContainer = container;
  rootProps = {
    children: [node]
  };
  nextUnitOfWork = workInProgressRoot = {
    type: "HOSTROOT",
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    props: rootProps,
    stateNode: container
  };
  requestIdleCallback(workLoop);
}

////////////////////////////////////////////
/// hooks
///////////////////////////////////////////


/// const [state, dispatch] = useReducer(reducerFn, initValue)
/// dispatch(action);
/// function reducerFn(state, action) {
///   switch(action.type) {
///     case 'add':
///        return {...state, newState: x};
///   }
/// }
function useReducer<T>(reducerFn: (oldValue: T, action: any) => T, initValue: T) {
  if (!currentFnFiber) throw Error("error");

  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  const hook: Hook<T> = {
    id: Math.random(),
    state: oldHook && oldHook.state ? oldHook.state : initValue,
    type: "STATE",
    fn: reducerFn
  };
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;

  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);

  /// 新值
  const dispatch = <R extends T>(action: R) => {
    hook.state = hook.fn(hook.state, action);
    // 重置全局的globalHookIndex: 重做reconcile时需要读取
    globalHookIndex = 0;
    nextUnitOfWork = workInProgressRoot = {
      id: Math.random(),
      type: "HOSTROOT",
      return: null,
      child: null,
      sibling: null,
      props: rootProps,
      stateNode: rootContainer,
      alternate: currentRoot
    };
    requestIdleCallback(workLoop);
  };
  return [hook.state as T, dispatch] as const;

}

/// const [value, setValue] = useState<T>(value as T)
/// setValue(newValue as T)
/// setValue((oldValue as T) => newValue as T)
function useState<T>(initValue: T) {
  if (!currentFnFiber) throw Error("error");
  const reducerFn = (oldValue: T, action: T) => {
    return action;
  };
  const [state, dispatch] = useReducer<T>(reducerFn, initValue);

  /// 新值
  const setState = (valueCallerOrValue: ((oldValue: T) => T) | T) => {
    dispatch(
      valueCallerOrValue instanceof Function
        ? valueCallerOrValue(state)
        : valueCallerOrValue);
  };
  return [state as T, setState] as const;
}

/// useEffect(callback: () => (() => void | null | undefined), deps: any[])
function useEffect(callback: EffectHookCallback, deps?: any[]) {
  if (!currentFnFiber) throw Error("error");
  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  const hasNoDeps = deps === undefined || deps === null;
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;
  const hook: Hook<undefined> = {
    id: Math.random(),
    type: "EFFECT",
    create: callback,
    created: false,
    deps: deps
  };
  if (
    !hasNoDeps &&
    Array.isArray(deps) &&
    oldHook &&
    Array.isArray(oldHook.deps) &&
    deps.every((d, index) => oldHook.deps![index] === d)
  ) {
    hook.create = oldHook.create;
    hook.created = oldHook.created;
    hook.destroy = oldHook.destroy;
  }
  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);
}

/// useEffect(callback: () => (() => void | null | undefined), deps: any[])
function useLayoutEffect(callback: EffectHookCallback, deps?: any[]) {
  if (!currentFnFiber) throw Error("error");
  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  const hasNoDeps = deps === undefined || deps === null;
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;
  const hook: Hook<undefined> = {
    id: Math.random(),
    type: "LAYOUTEFFECT",
    create: callback,
    created: false,
    deps: deps
  };
  if (
    !hasNoDeps &&
    deps &&
    oldHook &&
    Array.isArray(oldHook.deps) &&
    deps.every((d, index) => oldHook.deps![index] === d)
  ) {
    hook.create = oldHook.create;
    hook.created = oldHook.created;
    hook.destroy = oldHook.destroy;
  }
  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);
}


/// useRef
function useRef<T>(initValue: T | null): RefNode<T> {
  if (!currentFnFiber) throw Error("error");
  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;
  const ref = oldHook?.ref || (() => {
    return {
      current: initValue
    };
  })();
  const hook: Hook<T> = {
    id: Math.random(),
    type: "REF",
    ref: ref,
    created: false,
  };
  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);
  return ref;
}

/// useMemo
function useMemo<T>(initFn: () => T, deps: any[]): T {
  if (!currentFnFiber) throw Error("error");
  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  const hasNoDeps = deps === undefined || deps === null;
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;
  const hook: Hook<undefined> = {
    id: Math.random(),
    type: "MEMO",
    deps: deps,
    fn: undefined,
    value: undefined
  };
  if (
    !hasNoDeps &&
    Array.isArray(deps) &&
    oldHook &&
    Array.isArray(oldHook.deps) &&
    deps.every((d, index) => oldHook.deps![index] === d)
  ) {
    hook.value = oldHook.value;
    hook.fn = oldHook.fn;
    hook.id = oldHook.id;
  }
  if (hook.fn === undefined) hook.fn = initFn;
  if (hook.value === undefined) hook.value = initFn();
  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);
  return hook.value;
}

/// useCallback
function useCallback<T>(fn: () => T, deps: any[]): () => T {
  return useMemo(() => fn, deps);
}

/// forwardRef((props: any, ref: RefNode) => {});
export type FnCompoentProps = {
  ref?: RefNode<any> | undefined;
  [k: string]: any | undefined;
}
export type FnCompoentPropsWithoutRef = Omit<FnCompoentProps, 'ref'>;
function forwardRef(fnComponent: (props: FnCompoentPropsWithoutRef, ref: RefNode<any> | undefined) => any) {
  return (props: FnCompoentProps) => fnComponent(props as FnCompoentPropsWithoutRef, props.ref);
}

/// useImperativeHandle
function useImperativeHandle<T>(ref: RefNode<T> | undefined, refInitilizer: () => T, deps?: any[]) {
  if (!currentFnFiber) throw Error("error");
  if (!ref) return;
  let hookIndex = currentFnFiber.hookIndex || 0;
  const oldHook =
    currentFnFiber.alternate ?
      currentFnFiber.alternate.hooks &&
      currentFnFiber.alternate.hooks[hookIndex] : globalHookQueue[globalHookIndex];
  const hasNoDeps = deps === undefined || deps === null;
  currentFnFiber.hookIndex = ++hookIndex;
  globalHookIndex++;
  const hook: Hook<T> = {
    id: Math.random(),
    type: "IMPERATIVEHANDLE",
    handler: refInitilizer,
    created: false,
    deps: deps,
    ref: ref,
  };
  if (
    !hasNoDeps &&
    Array.isArray(deps) &&
    oldHook &&
    Array.isArray(oldHook.deps) &&
    deps.every((d, index) => oldHook.deps![index] === d)
    && ref === oldHook.ref
  ) {
    hook.handler = oldHook.handler;
    hook.created = oldHook.created;
  }
  currentFnFiber.hooks?.push(hook);
  if (!globalHookQueue[globalHookIndex]) globalHookQueue.push(hook);
}

/// useContext
interface RElement extends Element { }
interface Context<T> {
  Provier: (props: any, value: T) => any,
  value: T
}
function createContext<T>(initValue: T): Context<T> {
  let contextValue = {
    value: initValue
  };
  return {
    Provier: (props: any) => {
      contextValue.value = props.value
      return {
        type: 'root.provider',
        props: {
          ...props,
          contextValue
        }
      };
    },
    value: contextValue.value
  };
}

/// const ThemeContext = createContext({color: 'red'});
/// const {color} = useContext(ThemeContext);
function useContext<T>(context: Context<T>): T {
  if (!currentFnFiber) throw Error("error");
  let nextFiber: FiberNode | null = currentFnFiber;
  while (nextFiber) {
    if (nextFiber.props?.contextValue) {
      return nextFiber.props?.contextValue?.value || {};
    }
    // 找父亲的context
    nextFiber = nextFiber.return;
  }
  throw Error("No context provider");
}

export default {
  render,
  fiberRender,
  createElement,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useReducer,
  useCallback,
  createContext,
  useContext,
};
