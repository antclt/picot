export class SessionTreeController {
  #runtime;
  #target;
  #tree = { tree: [], leafId: null };

  constructor({ runtime, target }) {
    this.#runtime = runtime;
    this.#target = target;
  }

  current() {
    return structuredClone(this.#tree);
  }

  hydrate(tree) {
    this.#tree = structuredClone(tree);
  }

  async load() {
    const result = await this.#runtime.request({ type: "get_tree" }, this.#target);
    const tree = result?.response?.data ?? result?.data;
    if (!tree || !Array.isArray(tree.tree)) throw new Error("Pi returned an invalid session tree");
    this.hydrate(tree);
    return this.current();
  }
}
