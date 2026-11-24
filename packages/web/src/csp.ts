// Zod checks at load whether `new Function` works, to pick faster parsers. Under the Content-Security-Policy (no 'unsafe-eval') that probe is reported as a violation in the console even though it is caught. `jitless` skips the probe; parsing is the same, only a little slower. Must run before @omagari/contract loads, so it's the first import in main.tsx.
import { config } from "zod";

config({ jitless: true });
