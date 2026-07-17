# Reviewed retained migration lineage

This directory archives exact migration bytes that a retained Liber database
recorded before the canonical migration source was locked. It is evidence only:
Prisma migration configs must never point at this directory.

The only reviewed exception is scoped to Supabase project
`qfjcrhkjlczvzakxives` and migration
`20260707000009_add_avatar_variant`. Its successful Prisma ledger checksum is
`14b7876154c7f480d2d4d481edfed2ce0a74f70cc99065b58c7e585af7a38004`.
The canonical source checksum is
`22d8892fa82867af14ee2d5896e03539bd20de088a146b75a23986e33dae9190`.
The two files have identical executable SQL and differ only in full-line
comments.

Production readiness verifies the archived bytes, the canonical bytes, and
their comment-stripped SQL before accepting the retained checksum. Every other
target and migration continues to require the canonical local checksum.
