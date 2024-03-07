import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import rough from "roughjs/bundled/rough.esm";
import getStroke from "perfect-freehand";
// import { adjustedCoordinates } from './utils';

const generator = rough.generator();

const createElement = (id, x1, y1, x2, y2, type) => {
  switch (type) {
    case "line":
    case "rectangle":
      const roughElement =
        type === "line"
          ? generator.line(x1, y1, x2, y2)
          : generator.rectangle(x1, y1, x2 - x1, y2 - y1);
      return { id, x1, y1, x2, y2, type, roughElement };
    case "pencil":
      return { id, type, points: [{ x: x1, y: y1 }] };
    case "text":
      return { id, type, x1, y1, x2, y2, text: "" };
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const nearPoint = (x, y, x1, y1, name) => {
  return Math.abs(x - x1) < 5 && Math.abs(y - y1) < 5 ? name : null;
};

const onLine = (x1, y1, x2, y2, x, y, maxDistance = 1) => {
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  const c = { x, y };
  const offset = distance(a, b) - (distance(a, c) + distance(b, c));
  return Math.abs(offset) < maxDistance ? "inside" : null;
};

const positionWithinElement = (x, y, element) => {
  const { type, x1, x2, y1, y2 } = element;
  switch (type) {
    case "line":
      const on = onLine(x1, y1, x2, y2, x, y);
      const start = nearPoint(x, y, x1, y1, "start");
      const end = nearPoint(x, y, x2, y2, "end");
      return start || end || on;
    case "rectangle":
      const topLeft = nearPoint(x, y, x1, y1, "tl");
      const topRight = nearPoint(x, y, x2, y1, "tr");
      const bottomLeft = nearPoint(x, y, x1, y2, "bl");
      const bottomRight = nearPoint(x, y, x2, y2, "br");
      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
      return topLeft || topRight || bottomLeft || bottomRight || inside;
    case "pencil":
      const betweenAnyPoint = element.points.some((point, index) => {
        const nextPoint = element.points[index + 1];
        if (!nextPoint) return false;
        return onLine(point.x, point.y, nextPoint.x, nextPoint.y, x, y, 5) != null;
      });
      return betweenAnyPoint ? "inside" : null;
    case "text":
      return x >= x1 && x <= x2 && y >= y1 && y <= y2 ? "inside" : null;
    default:
      throw new Error(`Type not recognised: ${type}`);
  }
};

const distance = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const getElementAtPosition = (x, y, elements) => {
  return elements
    .map(element => ({ ...element, position: positionWithinElement(x, y, element) }))
    .find(element => element.position !== null);
};

// const adjustElementCoordinates = element => {
//   const { type, x1, y1, x2, y2 } = element;
//   if (type === "rectangle") {
//     const minX = Math.min(x1, x2);
//     const maxX = Math.max(x1, x2);
//     const minY = Math.min(y1, y2);
//     const maxY = Math.max(y1, y2);
//     return { x1: minX, y1: minY, x2: maxX, y2: maxY };
//   } else {
//     if (x1 < x2 || (x1 === x2 && y1 < y2)) {
//       return { x1, y1, x2, y2 };
//     } else {
//       return { x1: x2, y1: y2, x2: x1, y2: y1 };
//     }
//   }
// };

// const cursorForPosition = position => {
//   switch (position) {
//     case "tl":
//     case "br":
//     case "start":
//     case "end":
//       return "nwse-resize";
//     case "tr":
//     case "bl":
//       return "nesw-resize";
//     default:
//       return "move";
//   }
// };

// const resizedCoordinates = (clientX, clientY, position, coordinates) => {
//   const { x1, y1, x2, y2 } = coordinates;
//   switch (position) {
//     case "tl":
//     case "start":
//       return { x1: clientX, y1: clientY, x2, y2 };
//     case "tr":
//       return { x1, y1: clientY, x2: clientX, y2 };
//     case "bl":
//       return { x1: clientX, y1, x2, y2: clientY };
//     case "br":
//     case "end":
//       return { x1, y1, x2: clientX, y2: clientY };
//     default:
//       return null; //should not really get here...
//   }
// };

const useHistory = initialState => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([initialState]);

  const setState = (action, overwrite = false) => {
    const newState = typeof action === "function" ? action(history[index]) : action;
    if (overwrite) {
      const historyCopy = [...history];
      historyCopy[index] = newState;
      setHistory(historyCopy);
    } else {
      const updatedState = [...history].slice(0, index + 1);
      setHistory([...updatedState, newState]);
      setIndex(prevState => prevState + 1);
    }
  };

  const undo = () => index > 0 && setIndex(prevState => prevState - 1);
  const redo = () => index < history.length - 1 && setIndex(prevState => prevState + 1);

  return [history[index], setState, undo, redo];
};

const getSvgPathFromStroke = stroke => {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );

  d.push("Z");
  return d.join(" ");
};

const drawElement = (roughCanvas, context, element) => {
  switch (element.type) {
    case "line":
    case "rectangle":
      roughCanvas.draw(element.roughElement);
      break;
    case "pencil":
      const stroke = getSvgPathFromStroke(getStroke(element.points));
      context.fill(new Path2D(stroke));
      break;
    case "text":
      context.textBaseline = "top";
      context.font = "24px sans-serif";
      context.fillText(element.text, element.x1, element.y1);
      break;
    default:
      throw new Error(`Type not recognised: ${element.type}`);
  }
};

const adjustmentRequired = type => ["line", "rectangle"].includes(type);

const usePressedKeys = () => {
  const [pressedKeys, setPressedKeys] = useState(new Set());

  useEffect(() => {
    const handleKeyDown = event => {
      setPressedKeys(prevKeys => new Set(prevKeys).add(event.key));
    };

    const handleKeyUp = event => {
      setPressedKeys(prevKeys => {
        const updatedKeys = new Set(prevKeys);
        updatedKeys.delete(event.key);
        return updatedKeys;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return pressedKeys;
};

const App = () => {
  const [elements, setElements, undo, redo] = useHistory([]);
  const [action, setAction] = useState("none");
  const [tool, setTool] = useState("rectangle");
  const [selectedElement, setSelectedElement] = useState(null);
  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  const [startPanMousePosition, setStartPanMousePosition] = React.useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [scaleOffset, setScaleOffset] = useState({ x: 0, y: 0 });
  const [startPinchDistance, setStartPinchDistance] = useState(0);

  const textAreaRef = useRef();
  const pressedKeys = usePressedKeys();
  const getPinchDistance = (event) => {
    const touch1 = event.touches[0];
    const touch2 = event.touches[1];

    if (touch1 && touch2) {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    return 0;
  };
  useLayoutEffect(() => {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const roughCanvas = rough.canvas(canvas);

    context.clearRect(0, 0, canvas.width, canvas.height);


    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;

    const scaleOffsetX = (scaledWidth - canvas.width) / 2;
    const scaleOffsetY = (scaledHeight - canvas.height) / 2;
    setScaleOffset({ x: scaleOffsetX, y: scaleOffsetY });

    context.save();
    context.translate(panOffset.x * scale - scaleOffsetX, panOffset.y * scale - scaleOffsetY);

    context.scale(scale, scale)
    elements.forEach(element => {
      if (action === "writing" && selectedElement.id === element.id) return;
      drawElement(roughCanvas, context, element);
    });
    context.restore();
  }, [elements, action, selectedElement, panOffset, scale]);

  useEffect(() => {
    const undoRedoFunction = event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    document.addEventListener("keydown", undoRedoFunction);
    return () => {
      document.removeEventListener("keydown", undoRedoFunction);
    };
  }, [undo, redo]);

  useEffect(() => {
    const panOrZoomFunction = event => {
      if (pressedKeys.has("Meta") || pressedKeys.has("Control")) onZoom(event.deltaY * -0.01);
      else
        setPanOffset(prevState => ({
          x: prevState.x - event.deltaX,
          y: prevState.y - event.deltaY,
        }));
    };

    document.addEventListener("wheel", panOrZoomFunction);
    return () => {
      document.removeEventListener("wheel", panOrZoomFunction);
    };
  }, [pressedKeys]);

  useEffect(() => {
    const textArea = textAreaRef.current;
    if (action === "writing") {
      setTimeout(() => {
        textArea.focus();
        textArea.value = selectedElement.text;
      }, 0);
    }
  }, [action, selectedElement]);

  const updateElement = (id, x1, y1, x2, y2, type, options) => {
    const elementsCopy = [...elements];

    const adjustedX1 = (x1 - panOffset.x) / scale;
    const adjustedY1 = (y1 - panOffset.y) / scale;
    const adjustedX2 = (x2 - panOffset.x) / scale;
    const adjustedY2 = (y2 - panOffset.y) / scale;
    switch (type) {
      case "line":
      case "rectangle":
        elementsCopy[id] = createElement(id, adjustedX1, adjustedY1, adjustedX2, adjustedY2, type);
        break;
      case "pencil":
        // Adjust the new point coordinates based on the current scale and panOffset
        const adjustedX2Pencil = (x2 - panOffset.x) / scale;
        const adjustedY2Pencil = (y2 - panOffset.y) / scale;
        elementsCopy[id].points = [...elementsCopy[id].points, { x: adjustedX2Pencil, y: adjustedY2Pencil }];
        break;
      case "text":
        // Measure text and set adjusted coordinates
        const textWidth = document
          .getElementById("canvas")
          .getContext("2d")
          .measureText(options.text).width;
        const textHeight = 24;
        const adjustedX1Text = (x1 - panOffset.x) / scale;
        const adjustedY1Text = (y1 - panOffset.y) / scale;
        elementsCopy[id] = {
          ...createElement(id, adjustedX1Text, adjustedY1Text, adjustedX1Text + textWidth, adjustedY1Text + textHeight, type),
          text: options.text,
        };
        break;
      default:
        throw new Error(`Type not recognised: ${type}`);
    }

    setElements(elementsCopy, true);
  };
  const handlePointerDown = (event) => {
    if (action === "writing") return;

    const { clientX, clientY } = getPointerCoordinates(event);

    if (event.pointerType === 'touch' && event.pointers.length === 2) {
      // Two-finger touch for panning and pinch-to-zoom
      setAction("panningZooming");
      setStartPanMousePosition({ x: clientX, y: clientY });
      setStartPinchDistance(getPinchDistance(event));
      return;
    }

    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      if (element) {
        // ... (same logic as handleMouseDown for selection tool)
      }
    } else {
      const id = elements.length;
      const element = createElement(id, clientX, clientY, clientX, clientY, tool);
      setElements((prevState) => [...prevState, element]);
      setSelectedElement(element);

      setAction(tool === "text" ? "writing" : "drawing");
    }
  };

  const handlePointerMove = (event) => {
    const { clientX, clientY } = getPointerCoordinates(event);

    if (action === "panningZooming") {
      const deltaX = clientX - startPanMousePosition.x;
      const deltaY = clientY - startPanMousePosition.y;
      setPanOffset({
        x: panOffset.x + deltaX,
        y: panOffset.y + deltaY,
      });

      const currentPinchDistance = getPinchDistance(event);
      const deltaPinch = currentPinchDistance - startPinchDistance;

      if (Math.abs(deltaPinch) > 10) {
        // Adjust the zoom scale
        const zoomFactor = deltaPinch / 1000; // You may need to adjust this factor based on your needs
        const newScale = Math.min(Math.max(scale + zoomFactor, 0.5), 20);
        setScale(newScale);
      }

      setStartPinchDistance(currentPinchDistance);
      return;
    }

    const scaledClientX = (clientX - panOffset.x) / scale;
    const scaledClientY = (clientY - panOffset.y) / scale;

    if (tool === "selection") {
      const element = getElementAtPosition(clientX, clientY, elements);
      // ... (same logic as handleMouseMove for selection tool)
    }

    if (action === "drawing") {
      const index = elements.length - 1;
      const { x1, y1 } = elements[index];
      const width = scaledClientX - x1;
      const height = scaledClientY - y1;
      updateElement(index, x1, y1, x1 + width, y1 + height, tool);
      // } else if (action === "moving") {
      //   // ... (same logic as handlePointerMove for moving)
      // } else if (action === "resizing") {
      //   // ... (same logic as handlePointerMove for resizing)
      // }
    }
  };

  const handlePointerUp = (event) => {
    const { clientX, clientY } = getPointerCoordinates(event);

    if (action === "writing") return;

    if (event.pointerType === 'touch' && event.pointers.length === 0 && action === "panningZooming") {
      setAction("none");
      return;
    }

    if (selectedElement) {
      if (
        selectedElement.type === "text" &&
        clientX - selectedElement.offsetX === selectedElement.x1 &&
        clientY - selectedElement.offsetY === selectedElement.y1
      ) {
        setAction("writing");
        return;
      }

      const index = selectedElement.id;
      const { id, type } = elements[index];
      if ((action === "drawing" || action === "resizing") && adjustmentRequired(type)) {
        // ... (same logic as handlePointerUp for drawing and resizing)
      }
    }

    if (action === "writing") return;

    setAction("none");
    setSelectedElement(null);
  };
  const getPointerCoordinates = (event) => {
    const clientX = (event.clientX - panOffset.x + scaleOffset.x) / scale;
    const clientY = (event.clientY - panOffset.y + scaleOffset.y) / scale;
    return { clientX, clientY };
  };

  // const handleMouseDown = event => {
  //   if (action === "writing") return;

  //   const { clientX, clientY } = getMouseCoordinates(event);

  //   if (event.button === 1 || pressedKeys.has(" ")) {
  //     setAction("panning");
  //     setStartPanMousePosition({ x: clientX, y: clientY });
  //     return;
  //   }

  //   if (tool === "selection") {
  //     const element = getElementAtPosition(clientX, clientY, elements);
  //     if (element) {
  //       if (element.type === "pencil") {
  //         const xOffsets = element.points.map(point => clientX - point.x);
  //         const yOffsets = element.points.map(point => clientY - point.y);
  //         setSelectedElement({ ...element, xOffsets, yOffsets });
  //       } else {
  //         const offsetX = clientX - element.x1;
  //         const offsetY = clientY - element.y1;
  //         setSelectedElement({ ...element, offsetX, offsetY });
  //       }
  //       setElements(prevState => prevState);

  //       if (element.position === "inside") {
  //         setAction("moving");
  //       } else {
  //         setAction("resizing");
  //       }
  //     }
  //   } else {
  //     const id = elements.length;
  //     const element = createElement(id, clientX, clientY, clientX, clientY, tool);
  //     setElements(prevState => [...prevState, element]);
  //     setSelectedElement(element);

  //     setAction(tool === "text" ? "writing" : "drawing");
  //   }
  // };

  // const handleMouseMove = event => {
  //   const { clientX, clientY } = getMouseCoordinates(event);

  //   if (action === "panning") {
  //     const deltaX = clientX - startPanMousePosition.x;
  //     const deltaY = clientY - startPanMousePosition.y;
  //     setPanOffset({
  //       x: panOffset.x + deltaX,
  //       y: panOffset.y + deltaY,
  //     });
  //     return;
  //   }

  //   if (tool === "selection") {
  //     const element = getElementAtPosition(clientX, clientY, elements);
  //     event.target.style.cursor = element ? cursorForPosition(element.position) : "default";
  //   }

  //   if (action === "drawing") {
  //     const index = elements.length - 1;
  //     const { x1, y1 } = elements[index];
  //     updateElement(index, x1, y1, clientX, clientY, tool);
  //   } else if (action === "moving") {
  //     if (selectedElement.type === "pencil") {
  //       const newPoints = selectedElement.points.map((_, index) => ({
  //         x: clientX - selectedElement.xOffsets[index],
  //         y: clientY - selectedElement.yOffsets[index],
  //       }));
  //       const elementsCopy = [...elements];
  //       elementsCopy[selectedElement.id] = {
  //         ...elementsCopy[selectedElement.id],
  //         points: newPoints,
  //       };
  //       setElements(elementsCopy, true);
  //     } else {
  //       const { id, x1, x2, y1, y2, type, offsetX, offsetY } = selectedElement;
  //       const width = x2 - x1;
  //       const height = y2 - y1;
  //       const newX1 = clientX - offsetX;
  //       const newY1 = clientY - offsetY;
  //       const options = type === "text" ? { text: selectedElement.text } : {};
  //       updateElement(id, newX1, newY1, newX1 + width, newY1 + height, type, options);
  //     }
  //   } else if (action === "resizing") {
  //     const { id, type, position, ...coordinates } = selectedElement;
  //     const { x1, y1, x2, y2 } = resizedCoordinates(clientX, clientY, position, coordinates);
  //     updateElement(id, x1, y1, x2, y2, type);
  //   }
  // };

  // const handleMouseUp = event => {
  //   const { clientX, clientY } = getMouseCoordinates(event);
  //   if (selectedElement) {
  //     if (
  //       selectedElement.type === "text" &&
  //       clientX - selectedElement.offsetX === selectedElement.x1 &&
  //       clientY - selectedElement.offsetY === selectedElement.y1
  //     ) {
  //       setAction("writing");
  //       return;
  //     }

  //     const index = selectedElement.id;
  //     const { id, type } = elements[index];
  //     if ((action === "drawing" || action === "resizing") && adjustmentRequired(type)) {
  //       const { x1, y1, x2, y2 } = adjustElementCoordinates(elements[index]);
  //       updateElement(id, x1, y1, x2, y2, type);
  //     }
  //   }

  //   if (action === "writing") return;

  //   setAction("none");
  //   setSelectedElement(null);
  // };

  const handleBlur = event => {
    const { id, x1, y1, type } = selectedElement;
    setAction("none");
    setSelectedElement(null);
    updateElement(id, x1, y1, null, null, type, { text: event.target.value });
  };

  // const getTouchCoordinates = (event) => {
  //   const touches = event.touches;
  //   const touchCount = touches.length;

  //   if (touchCount === 1) {
  //     const touch = touches[0];
  //     const clientX = touch.clientX - panOffset.x;
  //     const clientY = touch.clientY - panOffset.y;
  //     return { clientX, clientY };
  //   } else if (touchCount === 2) {
  //     const touch1 = touches[0];
  //     const touch2 = touches[1];
  //     const centerX = (touch1.clientX + touch2.clientX) / 2;
  //     const centerY = (touch1.clientY + touch2.clientY) / 2;
  //     return { clientX: centerX - panOffset.x, clientY: centerY - panOffset.y };
  //   }

  //   return { clientX: 0, clientY: 0 }; // Default value
  // };

  // const handleTouchStart = (event) => {
  //   event.preventDefault();
  //   if (action === "writing") return;

  //   const { clientX, clientY } = getTouchCoordinates(event);

  //   if (event.touches.length === 2) {
  //     // Two-finger touch for panning and pinch-to-zoom
  //     setAction("panningZooming");
  //     setStartPanMousePosition({ x: clientX, y: clientY });
  //     setStartPinchDistance(getPinchDistance(event));
  //     return;
  //   }


  //   if (tool === "selection") {
  //     const element = getElementAtPosition(clientX, clientY, elements);
  //     if (element) {
  //       // ... (same logic as handleMouseDown for selection tool)
  //     }
  //   } else {
  //     const id = elements.length;
  //     const element = createElement(id, clientX, clientY, clientX, clientY, tool);
  //     setElements((prevState) => [...prevState, element]);
  //     setSelectedElement(element);

  //     setAction(tool === "text" ? "writing" : "drawing");
  //   }
  // };

  // const handleTouchMove = (event) => {
  //   event.preventDefault();
  //   const { clientX, clientY } = getTouchCoordinates(event);


  //   if (action === "panningZooming") {
  //     const deltaX = clientX - startPanMousePosition.x;
  //     const deltaY = clientY - startPanMousePosition.y;
  //     setPanOffset({
  //       x: panOffset.x + deltaX,
  //       y: panOffset.y + deltaY,
  //     });

  //     const currentPinchDistance = getPinchDistance(event);
  //     const deltaPinch = currentPinchDistance - startPinchDistance;

  //     if (Math.abs(deltaPinch) > 10) {
  //       // Adjust the zoom scale
  //       const zoomFactor = deltaPinch / 1000; // You may need to adjust this factor based on your needs
  //       const newScale = Math.min(Math.max(scale + zoomFactor, 0.5), 20);
  //       setScale(newScale);
  //     }

  //     setStartPinchDistance(currentPinchDistance);
  //     return;
  //   }
  //   const scaledClientX = (clientX - panOffset.x) / scale;
  //   const scaledClientY = (clientY - panOffset.y) / scale;


  //   if (tool === "selection") {
  //     const element = getElementAtPosition(clientX, clientY, elements);
  //     // ... (same logic as handleMouseMove for selection tool)
  //   }

  //   if (action === "drawing") {
  //     const index = elements.length - 1;
  //     const { x1, y1 } = elements[index];
  //     const width = scaledClientX - x1;
  //     const height = scaledClientY - y1;
  //     updateElement(index, x1, y1, x1 + width, y1 + height, tool);
  //     // } else if (action === "moving") {
  //     //   // ... (same logic as handleMouseMove for moving)
  //     // } else if (action === "resizing") {
  //     //   // ... (same logic as handleMouseMove for resizing)
  //     // }
  //   };
  // };

  // const handleTouchEnd = (event) => {
  //   event.preventDefault();
  //   const { clientX, clientY } = getTouchCoordinates(event);

  //   if (action === "writing") return;

  //   if (event.touches.length === 0 && action === "panningZooming") {
  //     setAction("none");
  //     return;
  //   }
  //   if (selectedElement) {
  //     if (
  //       selectedElement.type === "text" &&
  //       clientX - selectedElement.offsetX === selectedElement.x1 &&
  //       clientY - selectedElement.offsetY === selectedElement.y1
  //     ) {
  //       setAction("writing");
  //       return;
  //     }

  //     const index = selectedElement.id;
  //     const { id, type } = elements[index];
  //     if ((action === "drawing" || action === "resizing") && adjustmentRequired(type)) {
  //       // ... (same logic as handleMouseUp for drawing and resizing)
  //     }
  //   }

  //   if (action === "writing") return;

  //   setAction("none");
  //   setSelectedElement(null);
  // };

  useEffect(() => {
    const handleTouchMove = (event) => {
      if (event.touches.length >= 1) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  const onZoom = (delta) => {
    setScale(prevState => Math.min(Math.max(prevState + delta, 0.5), 20));
  }
  return (
    <div>
      <div style={{ position: "fixed", zIndex: 2 }}>
        <input
          type="radio"
          id="selection"
          checked={tool === "selection"}
          onChange={() => setTool("selection")}
        />
        <label htmlFor="selection">Selection</label>
        <input type="radio" id="line" checked={tool === "line"} onChange={() => setTool("line")} />
        <label htmlFor="line">Line</label>
        <input
          type="radio"
          id="rectangle"
          checked={tool === "rectangle"}
          onChange={() => setTool("rectangle")}
        />
        <label htmlFor="rectangle">Rectangle</label>
        <input
          type="radio"
          id="pencil"
          checked={tool === "pencil"}
          onChange={() => setTool("pencil")}
        />
        <label htmlFor="pencil">Pencil</label>
        <input type="radio" id="text" checked={tool === "text"} onChange={() => setTool("text")} />
        <label htmlFor="text">Text</label>
      </div>
      <div style={{ position: "fixed", zIndex: 2, bottom: 0, padding: 10 }}>
        <button onClick={() => onZoom(-0.3)}>-</button>
        <span onClick={() => setScale(1)}>
          {new Intl.NumberFormat("en-GB", { style: "percent" }).format(scale)}
        </span>
        <button onClick={() => onZoom(0.3)}>+</button>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
      </div>
      {action === "writing" ? (
        <textarea
          ref={textAreaRef}
          onBlur={handleBlur}
          style={{
            position: "fixed",
            top: (selectedElement.y1 - 2) * scale + panOffset.y * scale - scaleOffset.y,
            left: selectedElement.x1 * scale + panOffset.x * scale - scaleOffset.x,
            font: `${24 * scale} px sans-serif`,
            margin: 0,
            padding: 0,
            border: 0,
            outline: 0,
            resize: "auto",
            overflow: "hidden",
            whiteSpace: "pre",
            background: "transparent",
            zIndex: 2,
          }}
        />
      ) : null}
      <canvas
        id="canvas"
        width={window.innerWidth}
        height={window.innerHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};

export default App;
