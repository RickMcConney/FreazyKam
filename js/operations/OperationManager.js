class OperationManager {
  constructor() {
    this.operations = new Map();
    this.currentOperation = null;
    this.canvas = document.getElementById('canvas');
  }

  registerOperation(operation) {
    this.operations.set(operation.name, operation);
  }

  getOperation(name) {
    return this.operations.get(name);
  }

  getCurrentOperation() {
    return this.currentOperation;
  }

  setCurrentOperation(name) {
    if (this.currentOperation) {
      this.currentOperation.stop();
    }
    
    this.currentOperation = this.operations.get(name);
    if (this.currentOperation) {
      this.currentOperation.start();
    }
    const CURSOR_MAP = {
      Pan: 'grab', Origin: 'grab',
      Move: 'move',
      Pen: 'crosshair', Drill: 'crosshair',
      Text: 'text'
    };
    this.canvas.style.cursor = CURSOR_MAP[name] || 'default';
  }

  // eventName must be one of: 'Down', 'Move', 'Up'
  // Maps to operation methods: onMouseDown, onMouseMove, onMouseUp
  handleMouseEvent(eventName, canvas, evt) {
    if (this.currentOperation) {
      const handler = this.currentOperation[`onMouse${eventName}`];
      if (handler) {
        handler.call(this.currentOperation, canvas, evt);
      }
    }
  }

  addOperations(){
    for (let op of this.operations.values()) {
        addOperation(op.name,op.icon,op.tooltip);
    }
  }

  draw(ctx) {
    if (this.currentOperation) {
      this.currentOperation.draw(ctx);
    }
  }
}