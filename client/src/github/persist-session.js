import {inject} from 'aurelia-framework';
import {SessionId} from '../session-id';
import {EditSession} from '../edit/edit-session';
import {InitParams} from '../init-params';
import _ from 'lodash';

const KEY = 'dumber-gist-session:';

// Save session data before user attempt login,
// restore them after logged in (or cancelled login).
@inject(SessionId, InitParams, EditSession)
export class PersistSession {
  constructor(sessionId, params, editSession) {
    this.id = sessionId.id;
    this.previousId = params.sessionId;
    this.editSession = editSession;
  }

  _sessionData() {
    return {
      description: this.editSession.description,
      files: _.map(this.editSession.files, f => ({
        filename: f.filename,
        content: f.content,
        isChanged: !!f.isChanged
      })),
      gist: this.editSession.gist
    };
  }

  tryRestoreSession() {
    try {
      let data = localStorage.getItem(KEY);
      if (!data) return;
      localStorage.removeItem(KEY);
      data = JSON.parse(data);

      const sessionData = data[this.previousId];
      if (!sessionData) return;

      this.editSession.importData(sessionData);
    } catch (e) {
      // localStorage could be unavailable in iframe
      console.warn(e);
    }
  }

  saveSession() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        [this.id]: this._sessionData()
      }));
    } catch (e) {
      // localStorage could be unavailable in iframe
    }
  }
}
