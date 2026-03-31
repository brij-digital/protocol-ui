Hi Loris, thanks again, your note about instruction plans was very helpful.

I put together a very small live demo to show the boundary we ended up with on our side:
`https://app.brijmail.com/demo/loris/`

It focuses on one concrete Orca flow, `1 USDC -> SOL`, and tries to show only two things:
- Codama as the instruction-level source of truth
- the small runtime layer we still keep for deterministic quote logic and swap draft preparation

At the bottom there’s also a short explanation of how our runtime spec works in practice. I think it should make our current split much clearer than a long abstract explanation.
