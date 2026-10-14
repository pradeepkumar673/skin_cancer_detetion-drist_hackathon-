PROJECT: SkinSentry (Team Green Lights). Decision-support skin screening. Never claims a diagnosis.

NON-NEGOTIABLE RULES
1. No mock data, dummy responses, placeholder values, fake results, TODO/FIXME comments, or unfinished functions in committed code.
2. No hardcoded secrets, URLs, thresholds, model names, or file paths. Read from env vars or config files. Thresholds are computed from data by scripts and saved to config/thresholds.json.
3. Never invent model outputs. If a model file is missing, fail with a clear error message. Do not return fake predictions.
4. The LLM (Groq) only explains structured results. It never decides risk, never produces numbers that are not in its input.
5. Every API input is validated (Zod in Node, Pydantic in Python). Every error returns a clear JSON error and a correct HTTP status.
6. Never log secrets, passwords, tokens, or raw patient images. Patient identity is never sent to Groq (send de-identified features only).
7. Every feature ships with a test and a real-time verification instruction.
8. After each step: run tests, then commit with message "Step N: <title>" and push.
9. Ask the user before downloading datasets. Never fabricate dataset contents.
10. UI always shows: "Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis."

DESIGN AND COPY RULES (the website must look like a real clinical tool, not a template)
11. Palette only: #17252A ink, #2B7A78 teal, #3AAFA9 light teal, #DEF2F1 mist, #FEFFFF paper. Risk colours come from the tokens in docs/DESIGN_SYSTEM.md. No purple, violet, indigo or fuchsia anywhere. No gradients of any kind. No glassmorphism, blurred blobs, glow effects or heavy shadows.
12. Buttons, badges, inputs and cards use a corner radius of 4px at most. Never pill-shaped or fully rounded buttons. Never use rounded-full, rounded-xl, rounded-2xl or rounded-3xl.
13. No emoji anywhere: UI, copy, emails, logs, commit messages. Icons are inline SVG from lucide-react only.
14. No em dashes and no en dashes in any user-facing text, emails, legal pages or prompts that produce text. Use commas, colons, periods or parentheses.
15. No fake or placeholder content: no testimonials, reviews, ratings, customer logos, user counters, statistics, awards, certifications or "trusted by" claims. Every number on screen comes from the API, the database or a metrics file produced by our own evaluation.
16. No stock photos, no AI-generated images, no illustration packs. Visuals are SVG diagrams we author and real screenshots of the real app.
17. Copy is plain, specific and short. Banned words: revolutionize, cutting-edge, seamless, empower, unlock, next-generation, game-changing, supercharge, leverage, elevate, world-class, state-of-the-art, "your journey". "AI-powered" is never used as a claim on its own. Say concretely what the product does.
18. Motion: no scroll-triggered animation, no parallax, no animated counters, no custom cursor or cursor effects, no animation libraries. Only 150ms colour transitions on hover and focus, and a spinner for loading. Respect prefers-reduced-motion.
19. Accessibility: WCAG AA contrast, visible focus rings, labelled form fields, full keyboard operation. Never use colour alone to show risk; always add a text label and an icon.
20. Contrast rules for this palette: never put white text on #3AAFA9 (use #17252A). Teal #2B7A78 text only on #FEFFFF. On #DEF2F1 use #17252A text.
