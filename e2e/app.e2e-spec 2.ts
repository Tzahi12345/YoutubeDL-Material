import { YoutubeDLMaterialPage } from './app.po';

describe('youtube-dl-material App', () => {
  let page: YoutubeDLMaterialPage;

  beforeEach(() => {
    page = new YoutubeDLMaterialPage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!!');
  });
});
