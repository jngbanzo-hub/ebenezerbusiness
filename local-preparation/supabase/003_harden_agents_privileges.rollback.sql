GRANT TRUNCATE, TRIGGER
ON TABLE public.agents
TO authenticated;

GRANT REFERENCES
ON TABLE public.agents
TO authenticated;
