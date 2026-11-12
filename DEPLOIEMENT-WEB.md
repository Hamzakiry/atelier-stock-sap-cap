# Publication web gratuite et installation Android

La version web utilise **les services SAP CAP et OData V4 existants**, avec PostgreSQL via `@cap-js/postgres`. SQLite reste utilisé en local. La fonction Netlify adapte Express/CAP au format serverless ; elle ne réécrit pas les règles de stock.

## Séparer la démonstration des données du magasin

- Ne jamais envoyer `db.sqlite`, `private-data/`, les sauvegardes ou les coordonnées réelles dans GitHub ou dans la démonstration publique.
- La démonstration doit utiliser une base PostgreSQL dédiée, vide à son initialisation, et `STOCK_DEMO_MODE=true`.
- Les identifiants de démonstration sont publics. Leur rôle est de permettre des essais sur des données fictives.
- Les modifications de cette démonstration sont visibles par les autres personnes qui utilisent la même base.
- Les vraies données seront ajoutées plus tard dans une installation distincte avec des accès adaptés.

## Netlify Free + Neon Free

1. Dans Neon, créer une base dédiée au stock sur une offre Free ; conserver sa connexion PostgreSQL privée.
2. Dans Netlify, importer le dépôt `Hamzakiry/atelier-stock-sap-cap`, branche `main`, en restant sur le plan Free. Le fichier `netlify.toml` configure la construction, les fichiers statiques et la fonction CAP.
3. Définir `DATABASE_URL` côté serveur et `STOCK_DEMO_MODE=true`. Ne jamais préfixer la connexion par une variable de frontend ou la mettre dans Git.
4. Avant le premier accès, exécuter `npm run db:deploy-web` avec ces variables privées. Le script refuse toute base déjà non vide. Il charge uniquement des données fictives fournies avec les tests.
5. Publier et vérifier la connexion, la réception, les sorties FEFO, les rôles et le redémarrage de la fonction. La base doit rester persistante entre les exécutions.

Une initialisation n’est pas exécutée au démarrage des fonctions. Un nouveau déploiement ne doit pas réimporter les données ni effacer le stock.

La formule gratuite a des limites : crédits mensuels Netlify, ressources et stockage Neon. Un site peut être mis en pause quand ses quotas sont atteints. Ne pas activer de recharge automatique ni souscrire à une offre payante pour cette démonstration. La gratuité n’est pas une garantie de disponibilité permanente.

Sources : [Netlify Free](https://www.netlify.com/pricing/), [quotas de crédits Netlify](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [Neon](https://neon.com/pricing), [PostgreSQL dans CAP](https://cap.cloud.sap/docs/guides/databases/postgres).

## Android : application web installable (PWA)

Depuis Chrome sur Android, ouvrir l’adresse HTTPS publiée et toucher **Installer l’application**. Si l’installation native n’est pas proposée, le bouton explique comment utiliser le menu Chrome → Installer l’application ou Ajouter à l’écran d’accueil.

Il s’agit d’une PWA, sans APK et sans publication Play Store. Elle possède son icône et son affichage autonome. Le service worker met en cache uniquement l’interface statique, jamais les réponses `/catalog/`, mots de passe ou données du magasin. Une connexion Internet reste nécessaire pour consulter et modifier le stock. Aucune modification hors ligne n’est mise en attente.

Après une modification des fichiers d’interface, `npm run build:web` régénère la version du cache. Le stockage de langue reste local au navigateur et ne contient pas de données métier.

## Validation effectuée avant publication

Tests locaux SQLite ; tests d’authentification web ; vérification des actions réception et FEFO sur un PostgreSQL de test ; appel de la fonction Netlify avec une réponse OData. Le déploiement réel et l’installation sur un téléphone physique doivent être confirmés sur l’adresse finale.
