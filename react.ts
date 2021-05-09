/**
 * 手写Fiber
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

interface VNode {
  type: string;
  props: {
    children: any[];
    [k: string]: any;
  };
}

///////// 实现createElement
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
  console.log("createElement");
  return {
    type: type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextNode(child)
      )
    }
  };
}

//// 实现render stack
function render(node: VNode, container: HTMLElement) {
  console.log("render:", node);
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

interface Hook<T> {
  state: T;
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

  // 属性
  props?: Props;

  // dom
  stateNode?: HTMLElement | Text | null;

  // effect
  effectTag?: string;
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

// 更新dom: 添加属性和事件
function updateDom(
  dom: HTMLElement,
  newProps: Props | null | undefined,
  oldProps: Props | null | undefined
) {
  if (!newProps && !oldProps) {
    return;
  }
  let _newProps = newProps || {};
  let _oldProps = oldProps || {};

  // 取消不存在新的属性
  Object.keys(_oldProps)
    .filter((k) => !(k in _newProps) && k !== "children")
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
      } else if (k === "style") {
        console.log(_newProps[k]);
        // dom.setAttribute(k, Object.assign());
      } else {
        dom.setAttribute(k, _newProps[k]);
      }
    });
}

function createDom(fiber: FiberNode) {
  if (!fiber.stateNode) {
    switch (fiber.type) {
      case "TEXT":
        fiber.stateNode = document.createTextNode(fiber.props?.nodeValue);
        break;
      default:
        let dom = (fiber.stateNode = document.createElement(
          fiber.type as string
        ));
        // 赋值属性
        updateDom(dom, fiber.props, null);
    }
  }
}

function reconcileChildren(fiber: FiberNode, children: VNode[]) {
  // 子节点需要构建FiberNode
  // TODO: 删除、 更新操作
  if (!children) return;
  let oldChildFiber: FiberNode | null =
    (fiber.alternate && fiber.alternate.child) || null;
  let previousSibling: FiberNode | null = null;
  if (!oldChildFiber) {
    // 全部新增
    if (children && children.length > 0) {
      children.forEach((child) => {
        const newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: null,
          props: child.props,
          effectTag: "REPLACEMENT",
          nextEffect: null
        };
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
          alternate: oldChildFiber,
          props: child.props,
          effectTag: "UPDATE",
          nextEffect: null,
          stateNode: oldChildFiber?.stateNode
        };
      } else if (!oldChildFiber) {
        // 新建
        newFiber = {
          type: child.type,
          return: fiber,
          sibling: null,
          child: null,
          alternate: null,
          props: child.props,
          effectTag: "REPLACEMENT",
          nextEffect: null
        };
      } else if (child) {
        // 删除旧的Fiber
        oldChildFiber.effectTag = "DELETION";
      }
      if (!previousSibling) {
        fiber.child = newFiber;
      } else {
        previousSibling.sibling = newFiber;
      }
      previousSibling = newFiber;
      oldChildFiber = oldChildFiber?.sibling || null;
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
    reconcileChildren(fiber, children);
  }
}

// 创建函数式组件
let fnHookIndex = 0;
function updateFunctionDom(fiber: FiberNode) {
  fnHookIndex = 0;
  fiber.hooks = [];
  let dom = (fiber.type as Function)(fiber.props);
  reconcileChildren(fiber, [dom]);
}

// 处理节点dom
function beginWork(fiber: FiberNode) {
  if (fiber.type instanceof Function) {
    /// 函数式组件
    currentFnFiber = fiber;
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
  if (fiber.effectTag) {
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

  // // 挂载父节点
  // if (fiber.return) {
  //   fiber.return.stateNode?.appendChild(fiber.stateNode);
  // }

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

/// 第二阶段：提交作业
function commitRoot() {
  let workFiber = workInProgressRoot?.firstEffect;
  while (workFiber) {
    // 替换老节点，直接追加
    let parentFiber = workFiber.return;
    // 找到可以挂载的父节点
    while (parentFiber && !parentFiber.stateNode) {
      parentFiber = parentFiber.return;
    }
    if (workFiber.effectTag === "REPLACEMENT" && workFiber.stateNode) {
      parentFiber?.stateNode?.appendChild(workFiber.stateNode!);
    } else if (workFiber.effectTag === "DELETION") {
      // 删除老节点
      if (workFiber.stateNode) {
        parentFiber?.stateNode?.removeChild(workFiber.stateNode!);
      }
    } else if (workFiber.effectTag === "UPDATE") {
      console.log(
        "upppppppppppppppppppp",
        workFiber.props?.nodeValue,
        workFiber.alternate?.props?.nodeValue
      );
      if (
        workFiber.type === "TEXT" &&
        workFiber.props?.nodeValue !== workFiber.alternate?.props?.nodeValue
      ) {
        parentFiber?.stateNode?.removeChild(workFiber.stateNode!);
        workFiber.stateNode = document.createTextNode(
          workFiber.props?.nodeValue
        );
        parentFiber?.stateNode?.appendChild(workFiber.stateNode!);
      }
    }

    workFiber = workFiber.nextEffect;
  }
  // 重置workInProogressFiber
  currentRoot = workInProgressRoot;
  workInProgressRoot = null;
}

/// 循环工作
function workLoop(deadline: Deadline) {
  while (nextUnitOfWork && deadline.timeRemaining() > 0) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }
  // 提交: 当reconcile准备完，且未完成提交时
  if (!nextUnitOfWork && workInProgressRoot) {
    commitRoot();
  }
  if (nextUnitOfWork) requestIdleCallback(workLoop);
}

/// Fiber 渲染
function fiberRender(node: VNode, container: HTMLElement) {
  // requestIdleCallback(workLoop);
  currentRoot = workInProgressRoot = {
    type: "HOSTROOT",
    return: null,
    child: null,
    sibling: null,
    alternate: null,
    props: {
      children: [node]
    },
    stateNode: container
  };
  nextUnitOfWork = workInProgressRoot.child = {
    type: node.type,
    return: workInProgressRoot,
    child: null,
    sibling: null,
    alternate: null,
    props: node.props,
    effectTag: "REPLACEMENT",
    stateNode: null
  };
  requestIdleCallback(workLoop);
}

////////////////////////////////////////////
/// hooks
///////////////////////////////////////////

/// useState
function useState<T>(initValue: T) {
  console.log("useState.222................", fnHookIndex);
  if (!currentFnFiber) throw Error("xxx");
  const oldHook =
    currentFnFiber.alternate &&
    currentFnFiber.alternate.hooks &&
    currentFnFiber.alternate.hooks[fnHookIndex];
  const hook: Hook<T> = {
    state: oldHook ? oldHook.state : initValue
  };
  currentFnFiber.hooks?.push(hook);
  fnHookIndex++;

  /// 新值
  const setState = (valueCaller: (oldValue: T) => T) => {
    console.log("1111hook.state", hook.state);
    hook.state = valueCaller(hook.state);
    nextUnitOfWork = workInProgressRoot = {
      id: "2222",
      type: "HOSTROOT",
      return: null,
      child: null,
      sibling: null,
      props: currentRoot?.props,
      stateNode: currentRoot?.stateNode,
      alternate: currentRoot
    };
    console.log("nextUnitOfWork", workInProgressRoot);
    requestIdleCallback(workLoop);
  };

  return [hook.state, setState] as const;
}

export default {
  render,
  fiberRender,
  createElement,
  useState
};
