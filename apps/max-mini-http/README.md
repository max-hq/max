# @max/mini-http
A tiny http server to wrap a max instance.

Forwards readonly cli commands to max.

Intended as a short-term solution for handling `max -t <remote-url>` requests until max has serialisation codecs for core components.

**When does this disappear?**  
See [serialisation.md](../../design/serialisation.md) - max doesn't currently serialise core types across transports. So this disappears when:
- codecs written for Page / EntityInput etc
- serialisation wired into Proxy implementations
