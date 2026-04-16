# Prisma Migrations

Run the following after editing schema.prisma:

```
npx prisma migrate dev --name init
```

To seed patterns:
```
npx tsx scripts/seed-patterns.ts
```
