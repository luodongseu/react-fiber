# react-learning 

----------------------------------------

## React Fiber学习心得

- ### 为什么React要换基础架构？

React一直有一个诟病，就是在渲染动画、渲染复杂页面时fps不高，导致页面流畅度不佳，不论如何优化diff算法，都无法做到满意。因此React团队在v16时对基础的实现做了重构，经过调研各种优化方案，最终选用了Fiber架构，借鉴部分浏览器提供的`requestIdleCallback`思路，让浏览器通过执行优先级和时间维度等更合理的分配任务，来做到用户体验更佳的效果。

既然只有部分浏览器支持`requestIdleCallback`，那么React就需要polyfill，因此React实现了一个`Scheduler`库，模拟了`requestIdleCallback`方法，而且未来可以开源出来供更多的开发者使用，以便更好的利用浏览器的执行能力。

- ### React Fiber是什么？

Fiber含义为“纤维”，有分而治之、化繁为简的意义。有人说React Fiber就是时间切片，我个人觉得不是很准确的表达，因为React Fiber实际上是一个设计思路，在代码里Fiber就是一个结构体，而且是一个单链表的结构体，React Fiber是用单链表实现了遍历diff时可暂停、可恢复、可重做。而控制什么时候暂停、什么时候恢复的是有Scheduler来调度实现的。

React Fiber把React渲染分为了2个阶段：
第一个阶段是reconcile过程，也就是原来的Diff过程。该阶段主要负责构建Fiber树（链表），每个节点都需要完整的表达对应的虚拟dom的全部信息（包含类型、状态、属性、子节点、effect链等），通过深度递归算法一次遍历即可完成。
第二个阶段是commit过程。该阶段主要负责把准备好的Fiber树转成真正的dom，并追加到root节点上，等待浏览器完成渲染展示给用户。

- ### 为什么React Fiber需要两个阶段？

构建真正的dom树并让浏览器显示出来，这个过程不可中断，否则可能会导致给用户展示的页面出现混乱或不全。所以，commit阶段是一次性完成，必须在一个`requestIdleCallback`回调中完成。reconcile过程是计算过程，所以可以等待浏览器有空闲时间依次完成，没有时间就等待下一个空闲时间接着计算，整个reconcile过程不涉及浏览器渲染，单纯的只做内存计算。

- ### 怎么实现一个简单的React Fiber？

本项目以学习为目的，实现了一个功能非常简单的React。整个过程需要完成以下步骤：
（1）实现一个简单的Scheduler，可以通过`requestAnimation`（读取浏览器的帧开始时间）和`MessageChannel`（以宏任务为载体执行回调函数，保证在渲染前执行完毕）来配合实现返回剩余空闲时间的回调
（2）实现一个简单的`createElement`函数，用于babel的jsx转换，babel会利用全局的`React`来解析jsx语法，按`createElement`函数转换成指定的结构数（如json）
（3）实现`render`函数，主要构造rootFiber，然后通过`Scheduler`进入`workLoop`
（4）实现`workLoop`函数，主要分2个阶段，循环构造单个`FiberNode`，如果没有时间，则通过`Scheduler`等待下一次空闲时间继续执行，如果构造完整个`Fiber`树了，就进入`commit`阶段
（5）实现简单的`hooks`，其中`useLayoutEffect`需要在`reconcile`阶段重做，所以需要全局的`Hook`链（本项目用的是数组）保存临时状态


- ### 本项目实现了什么功能？
（1）支持基本的`Element`渲染
（2）支持函数组件渲染
（3）支持全部的hooks：`useReducer`|`useState`|`useEffect`|`useLayoutEffect`|`useRef`|`useImperativeHandle`|`useContext`|`useMemo`|`useCallback`
（4）简单的`Scheduler`调度器
