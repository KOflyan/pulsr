# Pulsr

## A very simple MIT-licensed NodeJS load balancer, built on top of [Node clusters](https://nodejs.org/api/cluster.html).

---

### Installation

```bash

npm install -g pulsr

```

### Usage

The following command:

```bash
pulsr start myApp.js
```

Will start your app with attached load balancer. Amount of created processes will depend on
[available CPUs](https://nodejs.org/api/os.html#osavailableparallelism). You can also provide
specific amount of processes to be spawned, e.g. the command below will create 2 processes which
will run `myApp.js`:

```bash
pulsr start myApp.js -p 2
```

Additionally, you can configure various parameters like process restart strategy, automatic restart
upon reaching certain memory threshold and more.

For available configuration options see

```bash
pulsr --help
pulsr start --help
```
