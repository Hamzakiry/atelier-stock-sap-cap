# Atelier Stock — SAP CAP

Application pédagogique de gestion de stock pour un magasin de produits et de matériel de pâtisserie. Le nom technique du dossier provient du projet initial ; le périmètre actuel est la gestion de stock.

## Démarrer en local

Environnement validé : Windows, Node.js 24.13.1, SAP CAP 10, SQLite.

```powershell
npm install
npm run db:init
npm run dev
```

Ouvrir http://localhost:4004/. `db:init` crée une nouvelle base avec des données fictives uniquement si `db.sqlite` est absent. Il ne réimporte pas les CSV dans une base existante.

Comptes de démonstration : `viewer` / `viewer-demo` pour consulter ; `manager` / `manager-demo` pour modifier. Cette authentification CAP mocked est réservée au développement, pas à une utilisation publique.

## Architecture et CAP

- `db/schema.cds` : entités persistées, associations et vue de calcul du stock.
- `srv/catalog-service.cds` : projections OData V4 en lecture seule, actions métier et rôles autorisés.
- `srv/catalog-service.js` : validations et transactions des actions. Une variation du stock et son mouvement sont enregistrés ensemble.
- `srv/fefo.js` : proposition des lots et confirmation dédupliquée par identifiant persistant.
- `app/` : interface web, navigation et graphiques utilisant les services CAP.
- `db.sqlite` : données locales persistantes ; fichier privé exclu de Git.
- `test/` : scénarios isolés, sans modification du stock réel.

Un produit possède plusieurs lots ; un lot possède plusieurs mouvements. Le stock physique est la somme des quantités restantes des lots. Le disponible exclut les lots périmés. Les kilogrammes et les pièces sont affichés séparément.

Fonctions disponibles : catalogue, fournisseurs, réceptions, entrées/sorties, inventaire justifié, FEFO, alertes de péremption, graphiques et auteur des mouvements. Aucun suivi commercial ni IA n’est intégré.

## Sauvegarder

```powershell
npm run db:backup
```

La commande affiche le chemin du fichier horodaté dans `backups/`. SQLite produit un instantané cohérent avec `VACUUM INTO`, puis son intégrité est vérifiée. La sauvegarde inclut les produits, fournisseurs, lots, mouvements, auteurs et identifiants de confirmation FEFO. Elle peut être faite pendant le fonctionnement de l’application ; en cas de verrou occupé, réessayer après l’opération en cours.

Le dossier `backups/` est exclu de Git. Copier régulièrement les sauvegardes sur un autre support privé : un fichier sur le même disque ne protège pas d’une panne de ce disque. Une sauvegarde peut contenir des données sensibles.

## Restaurer

1. Arrêter toutes les instances de l’application avec `Ctrl+C`, même celles utilisant un autre port.
2. Choisir la sauvegarde et exécuter, avec son chemin réel :

```powershell
npm run db:restore -- "C:\chemin\stock-sauvegarde.sqlite" --confirm
```

3. Relancer `npm run dev`, actualiser le navigateur et vérifier le stock et l’historique.

La restauration remplace **toutes les données actuelles** par celles de la sauvegarde ; elle ne fusionne pas les enregistrements. Elle crée d’abord une sauvegarde de secours de l’état actuel. Le fichier source, les tables attendues, l’intégrité et l’égalité des schémas sont vérifiés. Un schéma d’une autre version est refusé. Les écritures s’exécutent dans une transaction SQLite : en cas d’échec, elles sont annulées ensemble. Le serveur habituel sur le port 4004 doit être arrêté ; les autres ports doivent être contrôlés par l’utilisateur.

La restauration conserve le schéma actuel et restaure les données dans ses tables. Elle n’exécute aucun handler CAP : ce n’est pas une nouvelle réception ou une correction de stock. Restaurer aussi les identifiants FEFO évite d’oublier les confirmations déjà enregistrées au moment de la sauvegarde. Les opérations réalisées après cette sauvegarde seront perdues, comme pour toute restauration.

Utiliser uniquement une sauvegarde fiable de cette application, de la même version de schéma. Les anciennes sauvegardes avant migration ne sont pas automatiquement converties.

## Vérifier

```powershell
npm test
```

Les scénarios couvrent les validations, transactions, autorisations HTTP, péremptions, FEFO, inventaire, persistance, auteurs, sauvegarde et restauration. Les essais de restauration utilisent exclusivement une base temporaire.

## Limites

Projet local de démonstration : authentification de production, sauvegardes externes automatiques et traçabilité des créations/imports restent à compléter. Les sauvegardes ne sont ni chiffrées ni envoyées vers un service externe.

## Référentiel Kiry importé

Le 9 novembre 2026, import local du catalogue de facturation : 52 produits et 5 clients. Les références `KIRY-<id source>` identifient les produits importés ; les identifiants techniques de la source sont conservés séparément des UUID CAP. `Pc` devient `piece`, `Kg` devient `kg`. Le prix reste HT, avec la TVA source conservée comme information ; aucun calcul de facturation n’est ajouté. Les prix importés sont signalés HT dans le catalogue.

Les clients sont consultables via `/catalog/Clients` et la page Clients, avec les autorisations de consultation CAP existantes. Aucune vente ou facture n’est créée. Les produits importés n’ont aucun lot : le stock réel nécessite un inventaire ou une réception. Les seuils à zéro sont des valeurs initiales à renseigner, pas des seuils validés par le magasin. Les données de démonstration précédentes restent présentes.

L’export privé est dans `private-data/`, exclu de Git. Il ne doit pas être placé dans `db/data`, `test/data`, un README public ou le frontend. L’application de facturation est consultée sans modifier ses produits, clients ou factures ; seule une connexion de lecture est utilisée pour l’extraction. L’import ne crée aucune synchronisation automatique.

Pour rejouer l’import de cet export local :

```powershell
npm run db:import-kiry
```

Une sauvegarde est créée avant migration/import. Les références déjà importées sont ignorées, y compris si elles ont été modifiées localement. Les changements ultérieurs dans la facturation ne sont donc pas propagés automatiquement. Un conflit de référence annule la transaction d’import. Les anciennes sauvegardes antérieures à cette extension ont un autre schéma : elles sont refusées par la restauration standard. Créer une nouvelle sauvegarde après l’import.

## Journal du catalogue

La page **Journal du catalogue**, réservée au gestionnaire, affiche les 50 derniers changements de champs. Le service OData `/catalog/CatalogueChanges` est protégé par `@requires: Manager` et exposé en lecture seule. Les handlers `updateProduct` et `updateSupplier` conservent les valeurs avant/après, la référence, le champ, la date et `req.user.id` dans la même transaction CAP que la modification. Un enregistrement sans changement ne crée aucune entrée. Les modifications de stock restent dans l’historique des mouvements.

Pour une base existante antérieure à cette fonctionnalité : `npm run db:migrate-audit`. La migration crée une sauvegarde puis ajoute la table et la projection sans modifier les données existantes. Les sauvegardes courantes incluent le journal ; une sauvegarde antérieure utilise un autre schéma et est refusée par la restauration standard.

Le journal commence à son activation : les anciennes modifications, les créations et les imports ne sont pas reconstitués. Il protège la traçabilité via l’API ; ce n’est pas un journal inviolable contre un accès direct au fichier SQLite.

## Interface français / arabe

Les boutons **Français** et **العربية** sont disponibles en haut de chaque page, avant et après connexion. La préférence est mémorisée dans le navigateur. Le passage en arabe active une disposition de droite à gauche et traduit les commandes, libellés, aides, légendes et messages métier couverts. Le changement est immédiat, sans rechargement ni appel de traduction externe.

Les noms saisis, références, numéros de lot, coordonnées des clients, notes et valeurs du journal restent dans leur langue d’origine. Les champs en cours de saisie et la page active sont conservés. Les textes métier renvoyés par CAP restent inchangés dans l’API ; leur affichage est traduit côté navigateur. Les messages techniques inconnus restent affichés tels quels.

La page Péremptions explique les notions de présent en magasin, disponible et lot sans date. Les sorties guidées sont présentées comme le choix des lots qui expirent le plus tôt. Tests navigateur sur données fictives : FR/AR répété, RTL ordinateur/mobile, préférence après rechargement, champs conservés, noms métier inchangés, messages après opération et absence d’appel CAP lors du changement de langue.

## Parcours quotidien simplifié

L’accueil propose quatre actions : voir le stock, ajouter du stock, sortir du stock et compter le stock. Les contacts, le journal et le plan restent dans « Autres options ». Les graphiques, la saisie manuelle des mouvements et la création de produits se déplient à la demande. Les noms d’URL existants sont conservés.

Les formulaires d’entrée et de sortie disposent d’une recherche locale par nom ou référence, sans distinction de casse ou d’accents. Le filtrage ne sélectionne pas automatiquement un autre produit : le client confirme son choix. Une sortie guidée conserve les deux étapes proposition puis confirmation et les protections FEFO existantes. Le choix de langue et les saisies restent conservés.

Parcours navigateur validé sur une base fictive : réception de 10 pièces, proposition sans mutation, sortie de 3 pièces puis comptage à 6, en français et arabe ; raccourcis clavier/focus, affichage mobile et compte Viewer vérifiés. Les données réelles ne sont pas utilisées pour ces essais.

## Version web et application Android

Le projet comprend une configuration Netlify/PostgreSQL et une PWA installable sur Android. Voir [le guide de publication](DEPLOIEMENT-WEB.md). La base réelle et ses exports restent privés et locaux. La démonstration publique doit être initialisée exclusivement avec les données fictives.
