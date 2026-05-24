# Trading Journal Archive: Publicación Segura

Este repositorio representa un proyecto legado de portafolio. No está orientado a operación productiva activa.

## Objetivo

- Preservar arquitectura, decisiones y features del proyecto.
- Evitar exponer secretos, infraestructura privada y datos personales.

## Checklist antes de hacerlo público

1. Confirmar que no exista `.env` ni secretos reales en el árbol actual.
2. Rotar credenciales históricas usadas en despliegues pasados.
3. Reescribir historial para eliminar archivos sensibles antiguos.
4. Revisar README y docs para remover IPs, dominios o tokens internos.
5. Publicar como repo de archivo (`archive`) con release/tag congelado.

## Archivos removidos en el prep

- `workflow.json`
- `workflow-notifier.json`
- `update_workflow.py`
- `update_workflow_v2.py`

## Nota

El script `scripts/archive/sanitize-history.sh` automatiza saneamiento de historial en una copia local del repo.
