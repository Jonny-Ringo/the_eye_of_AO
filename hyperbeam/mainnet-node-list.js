const mainnetNodes = [
    {
        "hb": "https://tee-2.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 33.7838,
        "lng": -84.4455,
        "location": "Atlanta, Georgia, United States",
        "country": "US"
    },
    {
        "hb": "https://tee-3.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 42.0048,
        "lng": -87.9954,
        "location": "Elk Grove Village, Illinois, United States",
        "country": "US"
    },
    {
        "hb": "https://tee-4.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 40.5511,
        "lng": -74.4606,
        "location": "Piscataway, New Jersey, United States",
        "country": "US"
    },
    {
        "hb": "https://tee-5.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 32.7889,
        "lng": -96.8021,
        "location": "Dallas, Texas, United States",
        "country": "US"
    },
    {
        "hb": "https://tee-6.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 37.3931,
        "lng": -121.962,
        "location": "Santa Clara, California, United States",
        "country": "US"
    },
    {
        "hb": "https://tee-8.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 34.0609,
        "lng": -118.2414,
        "location": "Los Angeles, California, United States",
        "country": "US"
    },
    {
        "hb": "https://router-1.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 42.0048,
        "lng": -87.9954,
        "location": "Elk Grove Village, Illinois, United States",
        "country": "US"
    },
    {
        "hb": "https://dev-router.forward.computer/",
        "cu": "--",
        "proxy": false,
        "lat": 34.0609,
        "lng": -118.2414,
        "location": "Los Angeles, California, United States",
        "country": "US"
    },
    {
        "hb": "https://hb.perplex.finance/",
        "cu": "https://cu.perplex.finance/",
        "proxy": false,
        "lat": 43.6532,
        "lng": -79.3832,
        "location": "Toronto, Ontario, Canada",
        "country": "CA"
    },
    {
        "hb": "https://hb.marshal.ao/",
        "cu": "--",
        "proxy": false,
        "lat": 50.4777,
        "lng": 12.3649,
        "location": "Falkenstein, Saxony, Germany",
        "country": "DE"
    },
    {
        "hb": "https://arweave.nyc/",
        "cu": "--",
        "proxy": false,
        "lat": 40.9476,
        "lng": -73.8624,
        "location": "Yonkers, New York, United States",
        "country": "US"
    },
    {
        "hb": "https://hb.karakutu.xyz/",
        "cu": "https://karakutu.xyz/ao/cu/",
        "proxy": false,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    },
    {
        "hb": "https://hb.arnode.asia/",
        "cu": "https://cu.arnode.asia/",
        "proxy": false,
        "lat": 19.0748,
        "lng": 72.8856,
        "location": "Mumbai, Maharashtra, India",
        "country": "IN"
    },
    {
        "hb": "https://hb.randao.net/",
        "cu": "--",
        "proxy": false,
        "lat": 50.4777,
        "lng": 12.3649,
        "location": "Falkenstein, Saxony, Germany",
        "country": "DE"
    },
    {
        "hb": "https://hb.arweave.asia/",
        "cu": "https://cu.arweave.asia/",
        "proxy": false,
        "lat": 43.6532,
        "lng": -79.3832,
        "location": "Toronto, Ontario, Canada",
        "country": "CA"
    },
    {
        "hb": "https://hb.arhub.asia/",
        "cu": "https://cu.arhub.asia/",
        "proxy": false,
        "lat": 19.0748,
        "lng": 72.8856,
        "location": "Mumbai, Maharashtra, India",
        "country": "IN"
    },
    {
        "hb": "https://ao1.avx.im/",
        "cu": "--",
        "proxy": false,
        "lat": 50.4777,
        "lng": 12.3649,
        "location": "Falkenstein, Saxony, Germany",
        "country": "DE"
    },
    {
        "hb": "https://guez.dev/",
        "cu": "--",
        "proxy": false,
        "lat": 51.1864,
        "lng": 6.8624,
        "location": "Düsseldorf, North Rhine-Westphalia, Germany",
        "country": "DE"
    },
    {
        "hb": "http://38.58.182.4:10000/",
        "cu": "--",
        "proxy": true,
        "lat": 40.5247,
        "lng": -111.8638,
        "location": "Draper, Utah, United States",
        "country": "US"
    },
    {
        "hb": "http://84.247.181.43:10000/",
        "cu": "--",
        "proxy": true,
        "lat": 51.2357,
        "lng": 6.8091,
        "location": "Düsseldorf, North Rhine-Westphalia, Germany",
        "country": "DE"
    },
    {
        "hb": "http://65.108.201.218:8734/",
        "cu": "https://adn79.pro/ao/cu",
        "proxy": true,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    },
    {
        "hb": "http://95.216.248.117:10000/",
        "cu": "http://95.216.248.117:6363/",
        "proxy": true,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    },
    {
        "hb": "https://jonny-ringo.xyz/",
        "cu": "--",
        "proxy": true,
        "lat": 37.3931,
        "lng": -121.962,
        "location": "Santa Clara, California, United States",
        "country": "US"
    },
    {
        "hb": "http://65.109.91.146:10000/",
        "cu": "--",
        "proxy": true,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    },
    {
        "hb": "http://167.114.172.27:10001/",
        "cu": "http://167.114.172.27:6363/",
        "proxy": true,
        "lat": 45.5063,
        "lng": -73.5794,
        "location": "Montreal, Quebec, Canada",
        "country": "CA"
    },
    {
        "hb": "http://207.180.227.138:10000/",
        "cu": "http://207.180.227.138:6363/",
        "proxy": true,
        "lat": 48.9742,
        "lng": 8.1851,
        "location": "Lauterbourg, Grand Est, France",
        "country": "FR"
    },
    {
        "hb": "http://161.97.126.148:8734/",
        "cu": "--",
        "proxy": true,
        "lat": 48.9742,
        "lng": 8.1851,
        "location": "Lauterbourg, Grand Est, France",
        "country": "FR"
    },
    {
        "hb": "http://167.86.81.65:8734/",
        "cu": "--",
        "proxy": true,
        "lat": 49.405,
        "lng": 11.1617,
        "location": "Nuremberg, Bavaria, Germany",
        "country": "DE"
    },
    {
        "hb": "http://node.arweaveoasis.com:8734/",
        "cu": "--",
        "proxy": false,
        "lat": 1.28009,
        "lng": 103.851,
        "location": "Singapore, Central Singapore, Singapore",
        "country": "SG"
    },
    {
        "hb": "https://0.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://1.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://2.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://3.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://4.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://5.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://6.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://7.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://8.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "https://9.hb.ao.p10node.onl/",
        "cu": "--",
        "proxy": true,
          "lat": 49.0291,
        "lng": 8.35696,
        "location": "Karlsruhe, Baden-Wurttemberg, Germany",
        "country": "DE"
    },
    {
        "hb": "http://194.233.86.27:8734/ ",
        "cu": "--",
        "proxy": true,
        "lat": 1.2821,
        "lng": 103.851,
        "location": "Singapore, Central Singapore, Singapore",
        "country": "SG"
    },
    {
        "hb": "http://157.180.52.245:8734/",
        "cu": "--",
        "proxy": true,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    },
    {
        "hb": "https://hyperbeam.permaweb.black/",
        "cu": "--",
        "proxy": true,
        "lat": 60.1719,
        "lng": 24.9347,
        "location": "Helsinki, Uusimaa, Finland",
        "country": "FI"
    }
];

export { mainnetNodes };
 