-- AlterTable
ALTER TABLE "ChatbotConfiguration" ALTER COLUMN "personality" SET DEFAULT 'Chatbot amigable y conciso',
ALTER COLUMN "required_fields" SET DEFAULT '{"nombre": false, "numero": true, "correo": true, "direccion": false, "ciudad": false, "provincia": false, "pais": false}';
