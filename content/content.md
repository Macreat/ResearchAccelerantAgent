# Documento de Exposición del Agente Acelerador de Investigación GCPDS

Este documento está diseñado para ser leído junto con el `README.md` principal.
Proporciona un resumen conciso y un conjunto de puntos clave para exponer rápidamente el propósito y el valor del proyecto.

## Propósito
- Proporcionar una descripción general rápida para visitantes que revisan el repositorio.
- Destacar la misión central: un servidor de investigación auto-alojado y un asistente académico potenciado por IA.
- Ofrecer una forma rápida de explicar el proyecto sin leer el README completo.

## Puntos Clave 
1. **Centro de Investigación Auto-Alojado**
   - Este proyecto transforma un servidor en un entorno dedicado de asistente de investigación.
   - Soporta flujos de trabajo de IA local, indexación de PDF y automatización continua de investigación.

2. **Acceso a Agente e Interfaz**
   - El Agente de Investigación funciona a través de una interfaz web en el puerto `3000`.
   - El panel de CasaOS está disponible en el puerto `80`.
   - Se soporta acceso remoto a través de Tailscale y red local.

3. **Beneficios de la Infraestructura**
   - Se ejecuta como un servicio Linux resiliente.
   - Mantiene las cargas de trabajo de IA pesadas fuera de tu computadora personal.
   - Centraliza datos y procesos de investigación en una máquina de nivel servidor.

4. **Automatización y CI/CD**
   - El proyecto está construido para pruebas y despliegue automatizados.
   - Soporta GitHub Actions y ejecutores auto-alojados para integración continua.

5. **Instantánea de Pila Tecnológica**
   - Backend: Hono, tRPC v11, Node.js.
   - Frontend: React 19, Tailwind CSS.
   - IA: Ollama / Llama 3.1.
   - Base de Datos: MySQL/Postgres con Drizzle ORM.



