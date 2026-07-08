# Eben Ezer Business Design System

## Intention

Le design system pose une interface sombre premium pour une plateforme logistique internationale. Il combine un bleu nuit profond, un bleu electrique de confiance, un vert croissance pour les signaux positifs, des gris froids et des surfaces glassmorphism discretes.

## Tokens

- Couleurs: `tailwind.config.ts`, `src/app/globals.css`, `src/lib/design-tokens.ts`
- Typographie: famille sans/display basee sur Inter et system UI
- Rayons: `md`, `lg`, `xl`, `2xl` avec une base de `0.75rem`
- Ombres: `premium`, `glow`, `lime`
- Gradients: `ebe-night`, `ebe-electric`, `ebe-panel`, `ebe-radial`

## Composants

- `Button`: variantes `default`, `growth`, `outline`, `ghost`, `premium`
- `Card`: structure Shadcn-style avec header, title, description, content
- `Badge`: variantes statutaires
- `Container`: largeur responsive standard
- `SectionHeader`: titres de sections reutilisables
- `GlassPanel`: panneau anime avec Framer Motion
- `StatCard`: indicateur KPI
- `ServiceCard`: carte pour offres logistiques
- `DestinationCard`: carte de route ou destination
- `TrackingSearch`: formulaire de suivi typé avec Zod et React Hook Form

## Demo

La page de demonstration est disponible sur `/design-system`. La route racine redirige vers cette page tant que la page d'accueil complete n'est pas developpee.
