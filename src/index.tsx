/**
 * 
 * Examples for my custom react framework
 * 
 * @author luodongseu
 * 
 */
import React, { VNode, RefNode, FnCompoentPropsWithoutRef } from "./mreact";
const ReactDom = React;
// import React from "react";

// import App from "./App";
interface TodoProps {
  id?: any;
  num?: number;
}

// useContext
const ThemeContext = React.createContext({
  color: 'yellow'
});

// useEffect
function Todo(props: TodoProps) {
  const [num, setNum] = React.useState<number>(0);
  React.useLayoutEffect(() => {
    console.log("useEffect start");
    setNum((n) => n + 3);
    return () => {
      console.log("useEffect destoryed");
    };
  }, []);
  // React.useEffect(() => {
  //   console.log("useEffect start");
  //   setNum((n) => n + 3);
  //   return () => {
  //     console.log("useEffect destoryed");
  //   };
  // }, []);
  const { color } = React.useContext(ThemeContext);
  console.log('c', color);
  return (
    <div
      {...props}
      style={{
        backgroundColor: color,
        color: "white",
        height: 300,
        width: 399
      }}
    >
      TODO {num} {props.num}
    </div>
  );
}

type Todo2RefHandles = {
  focus: () => void,
  childRef: any
}

const Todo2 = React.forwardRef((props: FnCompoentPropsWithoutRef, ref: RefNode<Todo2RefHandles> | undefined) => {
  const ref2 = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle<Todo2RefHandles>(ref, () => ({
    focus: () => {
      ref2?.current?.focus();
    },
    childRef: ref2
  }));
  return <input ref={ref2} style={{ width: 200, height: 40, backgroundColor: 'grey' }} />;
})

type AnimationValue = {
  width: number;
  height: number;
};

function App() {
  const [num, setNum] = React.useState<number>(0);
  const [num2, setNum2] = React.useState<number>(0);
  const [animationValue, setAnimationValue] = React.useState<AnimationValue>({
    width: 100,
    height: 100
  });
  const memorizedValue = React.useMemo(() => num2, [num2]);
  const memorizedCallback = React.useCallback(() => {
    console.log('mem callback when num2 is:', num);
  }, [num2]);
  const ref = React.useRef<Todo2RefHandles>(null);
  const [color, setColor] = React.useState<string>('yellow');
  let jsx = <div className="App">
    <h2>memorizedValue:{memorizedValue}</h2>
    <button id="button1"
      onClick={() => {
        setNum((n) => n + 1);
        setAnimationValue({
          width: animationValue.width + 1,
          height: animationValue.height + 1
        });
        ref.current?.focus();
        memorizedCallback();
        setColor('green');
      }}
    >
      +1
</button>
    <button id="button2" onClick={() => {
      setNum2(num + num2);
      setColor('blue');
    }}>add2</button>
    <div id="A1">AAAA</div>
    <div id="Link1"><a href="www.baidu.com">{num}</a> ----------
<a href="www.baidu.com">{num2}</a></div>
    <div
      id="Animation1"
      style={{
        ...animationValue,
        backgroundColor: "red"
      }}
    ></div>
    <Todo2 id="TODO2" ref={ref} />
    {num % 5 !== 1 && <Todo id="Todo1" num={num} />}
    <div id="NUM">{num}</div>
  </div>;
  return (
    <ThemeContext.Provier key="xx" value={{ color }}>
      {jsx}
    </ThemeContext.Provier>
  );
}

ReactDom.fiberRender(<App />, document.getElementById("root")!);
