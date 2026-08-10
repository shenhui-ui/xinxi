export function createUndoStack(limit = 50) {
  const stack = []
  let redoStack = []

  function commit(snapshot) {
    stack.push(snapshot)
    if (stack.length > limit) stack.shift()
    redoStack = []
  }

  function push(snapshot, { force = false } = {}) {
    commit(snapshot)
  }

  function undo() {
    if (stack.length < 2) return null
    redoStack.push(stack.pop())
    return stack[stack.length - 1]
  }

  function redo() {
    const s = redoStack.pop()
    if (!s) return null
    stack.push(s)
    return s
  }

  function reset(initialSnapshot) {
    stack.length = 0
    redoStack = []
    if (initialSnapshot) stack.push(initialSnapshot)
  }

  return {
    push,
    undo,
    redo,
    reset,
    get canUndo() { return stack.length >= 2 },
    get canRedo() { return redoStack.length > 0 },
    get stack() { return stack },
  }
}
