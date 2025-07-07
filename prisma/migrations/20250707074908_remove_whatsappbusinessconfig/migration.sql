-- AlterTable
ALTER TABLE "ChatbotConfiguration" ADD COLUMN     "personality" TEXT DEFAULT 'Chatbot amigable que usa emojis y responde de manera casual',
ADD COLUMN     "required_fields" JSONB DEFAULT '{"nombre": true, "numero": false, "correo": true, "direccion": false, "ciudad": false, "provincia": false, "pais": false}';
