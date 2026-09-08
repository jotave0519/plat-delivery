-- Removes quoteAgentEnabled, added moments ago in the previous migration —
-- whatsappAgentDomain === 'ORCAMENTO' is itself the on/off switch (same
-- reasoning that removed despachoAgentEnabled in that same migration), so
-- a companion boolean was unnecessary. Caught before any application code
-- ever read/wrote this column.
ALTER TABLE "Restaurant" DROP COLUMN "quoteAgentEnabled";
