const {client: WebSocketClient} = require('websocket');
const got = require('got');
const args = require('minimist')(process.argv);
const Repl = require('repl');

const url = args.url || "http://localhost:3001";
const wsUrl = args['ws-url'] || "ws://localhost:3001";
const refreshToken = args.token.trim();

const RpcMethods = {
    AdminTopicSubscribe: 'AdminTopicSubscribe',
    AdminTopicUnsubscribe: 'AdminTopicUnsubscribe'
};

let id = 0;
const nextId = () => {
    id++;
    return id;
}

// Get access token from refresh
async function get_access_token(refresh_token) {
    let resp = got(`${url}/auth/token/refresh`, {
        method: 'POST',
        json: {refresh_token}
    });

    let json = await resp.json();
    return json.access_token;
}

// get ws token
async function get_token(accessToken) {
    let resp = got(`${url}/ws/token`, {
        method: 'POST',
        headers: {
            "authorization": `Bearer ${accessToken}`
        },
        json: true
    });

    let json = await resp.json();
    return json.auth_token;
}

async function main() {
    let accessToken = await get_access_token(refreshToken);
    console.log(`Got access token ${accessToken}`);
    let authToken = await get_token(accessToken)
    console.log(`Got auth token ${authToken}`);

    const client = new WebSocketClient();

    client.on('connectFailed', function (error) {
        console.log('Connect Error: ' + error.toString());
    });

    client.on('connect', function (connection) {
        console.log('WebSocket Client Connected');

        connection.on('error', function (error) {
            console.log("Connection Error: " + error.toString());
        });

        connection.on('close', function () {
            console.log('echo-protocol Connection Closed');
        });

        connection.on('message', function (message) {
            if (message.type === 'utf8') {
                console.log("⬇️  " + message.utf8Data + "'");
            } else {
                console.log(message);
            }
        });

        let repl = Repl.start('> ');

        repl.on('close', () => {
            connection.close();
        });

        let ctx = repl.context;

        const send = ctx.send = (data) => {
            connection.send(JSON.stringify(data));
        };

        const rpcCall = ctx.call = (method, params) => {
            send({id: nextId(), method, params});
        };

        ctx.sub = ctx.subscribe = (topic) => {
            rpcCall(RpcMethods.AdminTopicSubscribe, {topic})
        };

        ctx.usub = ctx.unsub = ctx.unsubscribe = (topic) => {
            rpcCall(RpcMethods.AdminTopicUnsubscribe, {topic})
        };

        ctx.reconnect = () => {
            repl.close();
            setImmediate(() => {
                main().catch(e => {
                    console.error(e);
                });
            })
        }
    });

    client.connect(`${wsUrl}/ws?auth_token=${authToken}`, []);

}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

