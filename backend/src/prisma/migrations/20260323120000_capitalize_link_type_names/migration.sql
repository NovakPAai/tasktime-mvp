-- Capitalize first letter of outbound_name and inbound_name for all existing link types
UPDATE "issue_link_types"
SET
  "outbound_name" = UPPER(LEFT("outbound_name", 1)) || SUBSTRING("outbound_name", 2),
  "inbound_name"  = UPPER(LEFT("inbound_name", 1))  || SUBSTRING("inbound_name", 2);
