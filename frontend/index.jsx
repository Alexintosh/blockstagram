import './css/main.scss';
import moment from 'moment';
import React from 'react';
import {render} from 'react-dom';
import NavBar from './comp/NavBar.jsx';
import ResetButton from './comp/ResetButton.jsx';
import Uploader from './comp/Uploader.jsx';
import Subscribers from './comp/Subscribers.jsx';
import {ImageWall} from './comp/ImageWall.jsx';
import SimpleCryptoJS from 'simple-crypto-js'

const blockstack = require( 'blockstack' );
const { getPublicKeyFromPrivate } = require('blockstack');
const { encryptECIES, decryptECIES } = require('blockstack/lib/encryption')

window.blockstack = blockstack;
class App extends React.Component {

  constructor() {
    super()
    this.state = {
      userData: null,
      loggedIn: false,
      index: {
        images: []
      },

      // Just the images
      images: [],
      image: [],

      // { username, path, image }
      imageFeed: [],
      subscribers: [],
      aesKey: null
    }
  }

  componentDidMount() {
    if (blockstack.isSignInPending()) {
      blockstack.handlePendingSignIn().then((data) => {
        console.dir(data)
        this.setupUser()
        this.setupKey()
      })
    } else if (blockstack.isUserSignedIn()) {
      console.log('Signed In')
      this.setupUser().then(() => {
        this.loadAESKey()
      })
    }
  }

  lookForNewImages() {
  }


  setupUser() {
    const userData = blockstack.loadUserData();
    this.setState({
      userData: userData,
      loggedIn: true
    });

    return blockstack.getFile('index.json').then(data => {
      if (data && !(data instanceof ArrayBuffer)) {
        console.log(data)
        let indexJson = JSON.parse(data) || {'images':[]};
        this.setState({index: indexJson});
      }
    })
      .then(() => {
        let promises = this.state.index.images.map((image) => {
          return this.fetchFile(image.path)
        })
        return Promise.all(promises)
      })
      .then((images) => {
        this.setState({ images: images })
      })
      .catch((e) => {
        console.error(e)
      })
  }

  loadAESKey() {
    blockstack.getFile(`keys/${this.state.userData.username}`)
      .then((data) => {
        let encryptedKey = JSON.parse(data)
        let decryptedKey = decryptECIES(blockstack.loadUserData().appPrivateKey, encryptedKey)
        this.setState({aesKey: decryptedKey})
      })
  }

  setupKey() {
    let aesKey = SimpleCryptoJS.generateRandom()

      const publicKey = getPublicKeyFromPrivate(blockstack.loadUserData().appPrivateKey)
      return blockstack.putFile('key.json', JSON.stringify(publicKey))
          .then(() => {
              console.log("public key saved");
              console.log(JSON.stringify(publicKey))
          })
        .then(() => {
            let encryptedAesKey = encryptECIES(publicKey, aesKey)
            let username = this.state.userData.username
            return blockstack.putFile(`keys/${username}`, JSON.stringify(encryptedAesKey))
          })
        .then(() => {
          this.setState({ aesKey })
        })
          .catch(e => {
              console.log(e);
          });

  }

  generateKey(p){
    var salt = CryptoJS.lib.WordArray.random(128/8);
    return CryptoJS.PBKDF2(p, salt, { keySize: 512/32, iterations: 1000 });
  }


  fetchFile(path) {
    return blockstack.getFile(path)
  }

  updateIndexAndImages(path, image) {
    let index = this.state.index
    const created = moment().toISOString();
    index['images'] = [...index.images, {path, created}]
    let images = [...this.state.images, image]

    blockstack.putFile('index.json', JSON.stringify(index))
      .then(() => {
        console.log('Index.json uploaded')
        this.setState({ index, images })
      })
      .catch((e) => {
        console.error(e)
      })
  }

  updateFeed(images) {
    console.log('in update feed: ', images);
    const newImageFeed = this.state.imageFeed;
    newImageFeed.push(images);
    newImageFeed.sort((imageA, imageB) => { return imageA.created < imageB.created});
    this.setState({imageFeed: newImageFeed});
  }


    componentWillMount() {
      if(this.state.loggedIn) {
          blockstack.getFile('subscribers.json')
              .then((data) => {
                  console.log('data returned from subscribers.json', data);
                  this.setState({subscribers: JSON.parse(data || [])})
                  this.readSubscribersImages()
              }).catch(err => {
              console.warn(err);
          })
      }
    }

    removeAllSubscribers() {
        blockstack.putFile('subscribers.json', '[]').then(() => {
            this.setState({subscribers: []});
        });
    }

    readSingleSubscribersImages(username) {
        blockstack.getFile('index.json', {
            username: username
        }).then(indexData => {
            let data = JSON.parse(indexData);
            data.images.map((indexEntry) => {
                blockstack.getFile(indexEntry.path, {username}).then((imageData) => {
                    this.updateFeed({path: indexEntry.path, username: username, image: imageData, created: indexEntry.created});
                })
            });
        }).catch(err => {
            console.warn(err);
        });
    }

    readSubscribersImages () {
        this.state.subscribers.forEach(subscriber => {
            this.readSingleSubscribersImages(subscriber.username);
        });
    }

    addSubscriber (newSubscriber) {
        blockstack.getFile('key.json', {
            username: newSubscriber
        }).then(keyData => {
            let subscribers = this.state.subscribers;
            subscribers.push({username: newSubscriber, publicKey: JSON.parse(keyData)});
            this.setState({subscribers})
            this.persistSubscribers();
            this.readSingleSubscribersImages(newSubscriber);
        })
            .catch(e => {
                console.log(newSubscriber + ' is no blockstagram user yet');
            })
    }

    persistSubscribers() {
        blockstack.putFile('subscribers.json', JSON.stringify(this.state.subscribers))
            .then(() => 'submitted subscribers.json')
            .catch(e => console.dir(e))
    }

  render () {
    return <div>

    <NavBar userData={this.state.userData}/>

    <section className="section">
      <div className="container">
        <Uploader updateIndexAndImages={this.updateIndexAndImages.bind(this)}/>
        <ResetButton />
      </div>
    </section>

    <section className="section">
      <div className="container">
          { this.state.loggedIn ? <Subscribers
              addSubscriber={this.addSubscriber.bind(this)}
              removeAllSubscribers={this.removeAllSubscribers.bind(this)}
              subscribers={this.state.subscribers}
              updateFeed={this.updateFeed.bind(this)}/> : '' }
      </div>
    </section>

    <section className="section">
      <div className="container is-desktop">
        <div className="columns">
          <div className="column is-two-thirds">
            <ImageWall images={this.state.images} />
            <ImageWall images={this.state.imageFeed.map(imageData => imageData.image)} />
          </div>
          <div className="column">
            Made with 💙 and 🍕 in Berlin.
            Thanks to <a href="https://blockstack.org/">blockstack</a>!
          </div>
        </div>
      </div>
    </section>

    </div>
    ;
  }
}

render(<App/>, document.getElementById('app'));


