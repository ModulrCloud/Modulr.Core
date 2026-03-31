-- One-time copy of legacy dial-shaped JSON into dial_route_entry (Stage 2).
-- See plan/dial_routes_multi_entry.md. Uses SQLite JSON1.
INSERT INTO dial_route_entry (
    scope, route_type, route, priority,
    endpoint_signing_public_key_hex, created_at, updated_at
)
SELECT
    'modulr.core',
    json_extract(route_json, '$.route_type'),
    json_extract(route_json, '$.route'),
    0,
    NULL,
    updated_at,
    updated_at
FROM core_advertised_route
WHERE singleton = 1
  AND json_extract(route_json, '$.route_type') IS NOT NULL
  AND json_extract(route_json, '$.route') IS NOT NULL
  AND typeof(json_extract(route_json, '$.route_type')) = 'text'
  AND typeof(json_extract(route_json, '$.route')) = 'text';

INSERT INTO dial_route_entry (
    scope, route_type, route, priority,
    endpoint_signing_public_key_hex, created_at, updated_at
)
SELECT
    lower(module_name),
    json_extract(route_json, '$.route_type'),
    json_extract(route_json, '$.route'),
    0,
    NULL,
    registered_at,
    registered_at
FROM modules
WHERE json_extract(route_json, '$.route_type') IS NOT NULL
  AND json_extract(route_json, '$.route') IS NOT NULL
  AND typeof(json_extract(route_json, '$.route_type')) = 'text'
  AND typeof(json_extract(route_json, '$.route')) = 'text';
