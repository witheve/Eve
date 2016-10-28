var providers = { }

export function provide(name, klass) {
  providers[name] = klass;
}

export function get(name): any {
  return providers[name];
}

