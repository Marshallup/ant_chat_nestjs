import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ACTIONS } from './chat.actions';
import { version, validate } from 'uuid';

@WebSocketGateway(3100, { namespace: 'video-rooms' })
export class VideoRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Namespace;

  private logger: Logger = new Logger('AppGateway');

  private getClientsByRoomID(roomID: string): string[] {
    const { rooms } = this.server.adapter;

    return Array.from(rooms.get(roomID) || []);
  }
  private validRoomID(roomID: string) {
    return validate(roomID) && version(roomID) === 4;
  }
  private getClientRooms() {
    const { rooms } = this.server.adapter;

    return Array.from(rooms.keys()).filter((roomID) =>
      this.validRoomID(roomID),
    );
  }
  private shareRoomsInfo() {
    this.server.emit(ACTIONS.SHARE_ROOMS, {
      rooms: this.getClientRooms(),
    });
  }
  private leaveRoom(@ConnectedSocket() client: Socket) {
    const { rooms } = this.server.adapter;

    Array.from(rooms.keys()).forEach((roomID) => {
      if (roomID !== client.id) {
        const clientsInRoom = this.getClientsByRoomID(roomID);

        clientsInRoom.forEach((clientRoomID) => {
          this.server
            .to(clientRoomID)
            .emit(ACTIONS.REMOVE_PEER, { peerID: client.id });

          client.emit(ACTIONS.REMOVE_PEER, {
            peerID: clientRoomID,
          });
        });
        client.leave(roomID);

        this.logger.log(`Клиент ${client.id} покинул комнату ${roomID}`);
      }
    });

    this.shareRoomsInfo();
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() message: string): void {
    this.server.emit('message', message);
  }
  afterInit() {
    this.logger.log('Init');
  }
  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Клиент отключился id: ${client.id}`);
    this.leaveRoom(client);
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    client.on(ACTIONS.CLIENT_READY_CONNECT, (config) => {
      const { roomID } = config;
      const clientsInRoom = this.getClientsByRoomID(roomID);

      clientsInRoom.forEach((cliendID) => {
        if (cliendID !== client.id) {
          this.server.to(cliendID).emit(ACTIONS.ADD_PEER, {
            peerID: client.id,
            createOffer: false,
          });

          client.emit(ACTIONS.ADD_PEER, {
            peerID: cliendID,
            createOffer: true,
          });
        }
      });
    });
    client.on(ACTIONS.JOIN, (config) => {
      const { roomID } = config;
      const { rooms: joinedRooms } = client;

      if (!this.validRoomID(roomID)) {
        client.emit(ACTIONS.ERROR_ROOM_CONNECTION, {
          error: true,
          message: 'Не валидный айди комнаты',
        });
        return;
      }
      if (Array.from(joinedRooms).includes(roomID)) {
        return console.warn(`Уже подключен к комнате ${roomID}`);
      }

      client.join(roomID);

      client.emit(ACTIONS.SUCCESS_ROOM_CONNECTION, {
        success: true,
        message: 'Успешный вход в комнату',
      });

      this.shareRoomsInfo();

      this.logger.log(`Клиент ${client.id} подключился к комнате ${roomID}`);
    });
    client.on(ACTIONS.RELAY_SDP, ({ peerID, sessionDescription }) => {
      this.server.to(peerID).emit(ACTIONS.SESSION_DESCRIPTION, {
        peerID: client.id,
        sessionDescription,
      });
    });
    client.on(ACTIONS.RELAY_ICE, ({ peerID, iceCandidate }) => {
      this.server.to(peerID).emit(ACTIONS.ICE_CANDIDATE, {
        peerID: client.id,
        iceCandidate,
      });
    });
    client.on(ACTIONS.GET_ROOMS, () => {
      this.shareRoomsInfo();
    });
    client.on(ACTIONS.LEAVE, () => {
      this.leaveRoom(client);
    });

    this.shareRoomsInfo();

    this.logger.log(`Клиент подключился id: ${client.id}`);
  }
}
