/**
 * 模拟浏览器的requestIdleCallback函数
 * 
 * 实现在浏览器空闲时后回调指定的任务
 * 
 * @author luodongseu
 */

/// 截止时间对象
export interface Deadline {
  timeRemaining(): number;
}

/// requestIdleCallback回调结构
export type RicCallback = (deadline: Deadline) => void;

// 调度中的回调函数
let scheduledCallback: RicCallback | null;

/// 是否正在调度rfa
let isAnimationScheduled = false;

/// 当前帧的结束时间
let frameDeadline = 0;

let scheduleChannel = new MessageChannel();
scheduleChannel.port2.onmessage = () => {
  isAnimationScheduled = false;

  // 正真处理callback
  if (!scheduledCallback) {
    return;
  }

  let deadline = {
    timeRemaining: () => {
      return frameDeadline - performance.now();
    }
  };

  let sc = scheduledCallback;
  scheduledCallback = null;
  sc(deadline);
};

// RAF 回调
function animationTick(rafTime: number) {
  frameDeadline = rafTime + 16;
  scheduleChannel.port1.postMessage(null);
}

/// RIC 实现浏览器空闲时回调
export function requestIdleCallback(callback: RicCallback) {
  scheduledCallback = callback;

  if (!isAnimationScheduled) {
    isAnimationScheduled = true;
    requestAnimationFrame(animationTick);
  }
}
