import { prisma } from '../src/infrastructure/database/prisma.js';

async function main() {
  console.log('Conectando a la base de datos...');
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true
    }
  });
  
  if (users.length === 0) {
    console.log('No hay usuarios creados en la base de datos.');
  } else {
    console.log(`Se encontraron ${users.length} usuarios:`);
    console.log(JSON.stringify(users, null, 2));
  }
}

main()
  .catch(e => {
    console.error('Error al conectar a la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
