# Mapbox Traffic

Suivez la durée de vos trajets habituels (maison → travail, école…) avec le
trafic en temps réel, visualisez-la en graphique et soyez prévenu en cas
d'embouteillage ou de durée anormalement longue. Les données viennent de
l'[API Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/)
(profil `driving-traffic`).

## Ce que vous obtenez

Un appareil **trajet** par trajet configuré (jusqu'à 3), avec :

| Fonctionnalité   | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| Durée du trajet  | Durée avec le trafic actuel, en minutes (historisée → graphique)  |
| Durée habituelle | Durée typique à ce moment de la semaine selon Mapbox (historisée) |
| Retard           | Différence entre les deux, en minutes                             |
| Distance         | Longueur de l'itinéraire recommandé, en km                        |
| Niveau de trafic | 0 fluide, 1 ralenti, 2 embouteillage, 3 bouchon important         |
| Trafic           | Le même niveau en texte (« Fluide », « Embouteillage »…)          |
| Par              | Les routes principales empruntées (« A86, A1 »)                   |

Plus :

- un **widget de tableau de bord** « Durée de trajet » : durée, retard,
  graphique durée actuelle vs durée habituelle, état du trafic et bouton
  « Actualiser » ;
- quatre **déclencheurs de scène** : _Embouteillage sur un trajet_, _Fin
  d'embouteillage_, _Durée de trajet anormalement longue_, _Durée revenue à la
  normale_ ;
- une **action de scène** _Obtenir la durée d'un trajet_, pour envoyer par
  exemple chaque matin « 32 min (+7 min) · Ralenti ».

## Configuration

1. Créez un compte gratuit sur [mapbox.com](https://account.mapbox.com/) et
   copiez votre **jeton d'accès public par défaut** (il commence par `pk.`).
   L'offre gratuite inclut 100 000 calculs d'itinéraire par mois.
2. Dans l'onglet **Configuration** de l'intégration, collez le jeton.
3. Renseignez au moins le **trajet 1** :
   - **Nom** : « Travail » par exemple ;
   - **Départ** : laissez vide pour partir de la position de la maison
     définie dans Gladys (Paramètres → Maisons), ou indiquez une adresse ou
     des coordonnées ;
   - **Destination** : une adresse (« 1 place de la Défense, Puteaux ») ou des
     coordonnées « latitude, longitude » (« 48.8924, 2.2369 », le format copié
     depuis Google Maps par un clic droit).
4. Cliquez sur **Tester Mapbox** : la durée actuelle du trajet 1 s'affiche
   sous le bouton.
5. Ouvrez l'onglet **Découverte** et ajoutez vos trajets.

### Actualisation

- **Intervalle** : 300 s par défaut (minimum 60 s).
- **Jours actifs** / **Heures actives** : pour n'interroger Mapbox qu'aux
  heures utiles, par exemple du lundi au vendredi, `07:00-09:30, 16:30-19:00`.
  Vides, les trajets sont actualisés en permanence. Les heures sont lues dans
  le **fuseau horaire** configuré (`Europe/Paris` par défaut).
- **Éviter** : péages, autoroutes, ferries.

### Offre gratuite Mapbox

L'API Directions inclut **100 000 requêtes gratuites par mois** ; au-delà,
Mapbox facture les requêtes supplémentaires (voir les
[tarifs Mapbox](https://www.mapbox.com/pricing#directions-api)). L'intégration
fait une requête par trajet à chaque actualisation, et ne géocode chaque
adresse qu'une fois. Consommation mensuelle ≈ trajets × actualisations par
heure × heures actives par jour × jours.

Par exemple, 3 trajets actualisés toutes les 5 minutes pendant 5 h par jour
ouvré consomment environ 4 000 requêtes par mois, et environ 26 000 s'ils sont
actualisés 24 h/24 : les deux restent dans l'offre gratuite. Actualiser 3
trajets chaque minute, 24 h/24, consomme environ 130 000 requêtes et la
dépasse.

Votre consommation réelle est visible dans votre
[compte Mapbox](https://account.mapbox.com/).

### Alertes

- **Embouteillage** : détecté quand au moins 10 % (réglable) de la distance
  est en circulation dense selon Mapbox, ou que la durée dépasse nettement la
  durée habituelle (+35 %).
- **Durée anormalement longue** : quand la durée dépasse la durée habituelle
  de 30 % **et** d'au moins 5 minutes (réglables), pour éviter les alertes
  sur un trajet court qui passe de 4 à 6 minutes.

## Exemples de scènes

- **Prévenir en cas de bouchon** : déclencheur _Embouteillage sur un trajet_
  (trajet « Travail »), action « Envoyer un message » :
  `Bouchon vers le travail : {{triggerEvent.data.summary}}`.
- **Réveil adaptatif** : à 7 h en semaine, action _Obtenir la durée d'un
  trajet_, puis action « Envoyer un message » en insérant la variable
  _Résumé_ (ou _Durée du trajet (min)_) produite par l'action précédente.
- **Seuil personnel** : comme l'appareil est un appareil Gladys standard, le
  déclencheur natif « Valeur d'un appareil » fonctionne aussi :
  « quand Durée du trajet (Travail) > 45 ».

Les déclencheurs d'événement ne se déclenchent qu'au **changement** d'état
(un seul « Embouteillage » tant que le bouchon dure).

## Dépannage

- **« Mapbox a refusé le jeton d'accès »** : vérifiez le jeton sur
  [account.mapbox.com](https://account.mapbox.com/access-tokens/).
- **Adresse introuvable** : essayez une adresse plus complète, ou des
  coordonnées.
- **« la maison n'a pas de position »** : définissez la position de la
  maison dans Gladys, ou renseignez le départ.
- Les logs de l'intégration (onglet Logs, ou `docker logs`) détaillent chaque
  actualisation ; passez `LOG_LEVEL=debug` pour voir les requêtes (le jeton y
  est masqué).
