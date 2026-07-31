REVOKE TRUNCATE, TRIGGER
ON TABLE public.agents
FROM authenticated;

REVOKE REFERENCES
ON TABLE public.agents
FROM authenticated;
