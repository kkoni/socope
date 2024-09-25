import { useEffect, useState } from 'react';
import { Image, StyleSheet, Pressable, View } from 'react-native';
import { Avatar, Text } from 'react-native-paper';
import { Hyperlink } from 'react-native-hyperlink';
import { linkHandler } from '../model/lib/util';
import { formatTimeDiff } from '../model/lib/date';
import { commonStyles } from '../model/lib/style';
import { Actor, ActorId, EmbeddedImage, EmbeddedWebPage, Post, PostTextPart, getPostUrl } from '../model/data';
import { getActorRepository } from '../model/repositories';
import { PostIndex } from '../model/posts/data';

type Props = {
  postIndex: PostIndex;
  post?: Post;
  embeddedPost?: Post;
};

export default function PostView(props: Props) {
  const [ actor, setActor ] = useState<Actor|undefined>(undefined);
  const [ authorOfEmbeddedPost, setAuthorOfEmbeddedPost ] = useState<Actor|undefined>(undefined);

  useEffect(() => {(async () => {
    const actor = await getActorRepository().get(props.postIndex.postedBy);
    if (actor !== undefined) {
      setActor(actor);
    }
  })()}, [props]);

  useEffect(() => {(async () => {
    if (props.embeddedPost !== undefined) {
      const actor = await getActorRepository().get(props.embeddedPost.authorId);
      if (actor !== undefined) {
        setAuthorOfEmbeddedPost(actor);
      }
    }
  })()}, [props.embeddedPost]);

  const postUrl = (props.post && actor) ? getPostUrl(props.post, actor) : undefined;
  const view = (
    <View style={postViewStyles.container}>
      <IconView actor={actor} size={32}/>
      <View style={postViewStyles.mainContainer}>
        <HeaderView actorId={props.postIndex.postedBy} postedAt={props.postIndex.postedAt} actor={actor} withIcon={false}/>
        { props.post &&
          <View style={postViewStyles.content}>
            <ContentView post={props.post}/>
            { props.embeddedPost && authorOfEmbeddedPost &&
              <View style={postViewStyles.embeddedPost}>
                <EmbeddedPostView post={props.embeddedPost} author={authorOfEmbeddedPost}/>
              </View>
            }
            { props.post.embeddedWebPage &&
              <View style={postViewStyles.embeddedWebPage}>
                <EmbeddedWebPageView webPage={props.post.embeddedWebPage}/>
              </View>
            }
          </View>
        }
      </View>
    </View>
  );

  if (postUrl === undefined) {
    return view;
  } else {
    return (
      <Pressable onPress={() => linkHandler(postUrl)}>
        { view }
      </Pressable>
    );
  }
}

const postViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
  iconView: { flex: 1 },
  mainContainer: { flex: 8, flexDirection: 'column', marginLeft: 5 },
  content: { marginTop: 5 },
  embeddedPost: { margin: 5, padding: 5, borderWidth: 1, borderRadius: 10, borderColor: 'lightgray' },
  embeddedWebPage: { margin: 5, padding: 5, borderWidth: 1, borderRadius: 10, borderColor: 'lightgray' },
});

type IconViewProps = {
  actor?: Actor;
  size: number;
}

export function IconView(props: IconViewProps) {
  const iconUri = props.actor?.icon;
  if (iconUri === undefined) {
    return (<View></View>);
  }
  return (
    <View>
      <Avatar.Image source={{uri: iconUri}} size={props.size}/>
    </View>
  );
}

type HeaderViewProps = {
  actorId: ActorId;
  postedAt: Date;
  actor?: Actor;
  withIcon: boolean;
};

export function HeaderView(props: HeaderViewProps) {
  const timeDiff = formatTimeDiff(Date.now() - props.postedAt.getTime());

  if (props.actor === undefined) {
    return (
      <View>
        <Text>{props.actorId.toString()}</Text>
        <Text>{timeDiff}</Text>
      </View>
    );
  }
  return (
    <View style={headerViewStyles.container}>
      { props.withIcon && <View style={headerViewStyles.icon}><IconView actor={props.actor} size={16}/></View> }
      <Text style={headerViewStyles.actorName}>{props.actor.name}</Text>
      <Text style={headerViewStyles.actorHandle}>@{props.actor.handle}</Text>
      <Text style={headerViewStyles.timeDiff}>{timeDiff}</Text>
    </View>
  );
}

const headerViewStyles = StyleSheet.create({
  container: { flexDirection: 'row' },
  icon: { marginRight: 5 },
  actorName: { fontWeight: 'bold' },
  actorHandle: { color: 'gray', marginLeft: 5 },
  timeDiff: { color: 'gray', marginLeft: 5 },
});

type ContentViewProps = {
  post: Post;
}

export function ContentView(props: ContentViewProps) {
  function getTextPartComponent(textPart: PostTextPart, index: number) {
    if (textPart.linkUrl !== undefined) {
      return (
        <Hyperlink
          key={'tp-' + index}
          linkText={textPart.text}
          onPress={linkHandler}
          linkStyle={commonStyles.link}
        >
          <Text>{textPart.linkUrl}</Text>
        </Hyperlink>
      );
    } else {
      return (<Text key={'tp-' + index}>{textPart.text}</Text>);
    }
  }
  const textPartComponents = props.post.text.map((textPart, index) =>
    getTextPartComponent(textPart, index)
  );

  function getEmbeddedImageComponent(embeddedImages: EmbeddedImage[]) {
    return embeddedImages.map((embeddedImage, index) => {
      const aspectRatio = embeddedImage.width / embeddedImage.height;
      return (
        <View key={'ei-' + index}>
          <Image
            source={{uri: embeddedImage.url}}
            resizeMode="contain"
            style={{width: '90%', aspectRatio: aspectRatio}}
          />
        </View>
      )
    });
  }

  return (
    <View>
      <View style={contentViewStyles.textContainer}>
        { textPartComponents }
      </View>
      <View>
        { getEmbeddedImageComponent(props.post.embeddedImages) }
      </View>
    </View>
  );
}

const contentViewStyles = StyleSheet.create({
  textContainer: { flexDirection: 'column' },
});

type EmbeddedPostViewProps = {
  post: Post;
  author: Actor;
};

export function EmbeddedPostView(props: EmbeddedPostViewProps) {
  const postUrl = getPostUrl(props.post, props.author);
  const view = (
    <View style={postViewStyles.container}>
      <View style={postViewStyles.mainContainer}>
        <HeaderView actorId={props.author.id} postedAt={props.post.createdAt} actor={props.author} withIcon={true}/>
        <View style={postViewStyles.content}>
          <ContentView post={props.post}/>
        </View>
      </View>
    </View>
  );
  if (postUrl === undefined) {
    return view;
  } else {
    return (
      <Pressable onPress={() => linkHandler(postUrl)}>
        { view }
      </Pressable>
    );
  }
}

type EmbeddedWebPageViewProps = {
  webPage: EmbeddedWebPage;
}

export function EmbeddedWebPageView(props: EmbeddedWebPageViewProps) {
  return (
    <Pressable onPress={() => linkHandler(props.webPage.url)}>
      <View>
        <Text style={embeddedWebPageViewStyles.title}>{props.webPage.title}</Text>
        <Text>{props.webPage.description}</Text>
        { props.webPage.thumbnailImageUrl &&
          <Image
            source={{uri: props.webPage.thumbnailImageUrl}}
            style={embeddedWebPageViewStyles.thumbnail}
          />
        }
      </View>
    </Pressable>
  );
}

const embeddedWebPageViewStyles = StyleSheet.create({
  title: { fontWeight: 'bold', marginBottom: 10 },
  thumbnail: { width: '100%', aspectRatio: 16/9 },
});
