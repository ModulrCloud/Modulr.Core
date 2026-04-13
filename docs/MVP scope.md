# Modulr.Core MVP Scope

This implementation supports:

- register_module
- lookup_module
- register_name (handles ``@user``, ``user@domain.subdomain``, ``domain.subdomain``)
- register_org (organization domain only: ``domain.subdomain``, no ``@``)
- resolve_name
- reverse_resolve_name (``resolved_id`` → list of bound names)
- heartbeat_update

This implementation does not yet support:

- inter-validator sync
- modulr.assets integration
- modulr.storage integration
- bootstrap expiration enforcement beyond simple config
- WebRTC
- custom packet transport
