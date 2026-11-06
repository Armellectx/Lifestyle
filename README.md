# Lifestyle

Application de prise de notes quotidienne : une PWA installable qui fonctionne hors ligne. Les notes sont stockées localement dans IndexedDB et peuvent être exportées ou importées en JSON.

## Lancer en local

Aucune dépendance ni étape de build. Il faut juste un serveur HTTP, car le service worker ne fonctionne pas en `file://` :

```bash
python3 -m http.server 8000
```

Ouvrir ensuite http://localhost:8000. Pour installer l'app, utiliser le bouton « Installer » ou le menu du navigateur.

## Fonctionnalités

- **Note du jour** : ouvre la note de la date du jour, ou la crée si elle n'existe pas encore.
- Création, édition et suppression de notes, avec enregistrement automatique.
- Recherche dans les titres et le contenu.
- **Export JSON** de toutes les notes, et **import** qui fusionne avec les notes existantes : à identifiant égal, la version la plus récente est conservée.
- Fonctionne hors ligne, thème clair/sombre automatique, mise en page adaptée au mobile.
- Raccourcis : `Ctrl+S` pour enregistrer tout de suite, `Ctrl+Alt+N` pour une nouvelle note, `Échap` pour fermer la note.

## Format d'export

```json
{
  "format": "lifestyle-notes",
  "version": 1,
  "exportedAt": "2026-11-05T19:00:00.000Z",
  "count": 1,
  "notes": [
    {
      "id": "uuid",
      "title": "Jeudi 5 novembre 2026",
      "content": "…",
      "day": "2026-11-05",
      "createdAt": 1793905200000,
      "updatedAt": 1793905200000
    }
  ]
}
```

`day` n'est rempli que pour les notes du jour. Les dates sont des timestamps en millisecondes. L'import accepte aussi un simple tableau de notes.

## Structure

```
index.html            page unique
css/styles.css        styles
js/db.js              accès IndexedDB
js/app.js             logique de l'interface, export/import
sw.js                 service worker (cache hors ligne)
manifest.webmanifest  manifeste PWA
icons/                icônes
```

## Mettre à jour l'app

Les fichiers sont mis en cache par le service worker. Après une modification, incrémenter `CACHE_VERSION` dans [sw.js](sw.js) pour que les utilisateurs reçoivent la nouvelle version.

## Données

Les notes restent dans le navigateur, sur l'appareil. Si on vide les données du site, elles sont perdues : pensez à exporter régulièrement.
