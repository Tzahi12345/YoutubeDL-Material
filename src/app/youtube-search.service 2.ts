import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export class Result {
  id: string
  title: string
  desc: string
  thumbnailUrl: string
  videoUrl: string
  uploaded: any;

  constructor(obj?: any) {
    this.id           = obj && obj.id           || null
    this.title        = obj && obj.title        || null
    this.desc         = obj && obj.desc         || null
    this.thumbnailUrl = obj && obj.thumbnailUrl || null
    this.uploaded = obj && obj.uploaded || null
    this.videoUrl     = obj && obj.videoUrl     || `https://www.youtube.com/watch?v=${this.id}`

    this.uploaded = formatDate(Date.parse(this.uploaded));
  }

}

@Injectable({
  providedIn: 'root'
})
export class YoutubeSearchService {

  url = 'https://www.googleapis.com/youtube/v3/search';
  key = null;

  constructor(private http: HttpClient) { }

  initializeAPI(key) {
    this.key = key;
  }

  search(query: string): Observable<Result[]> {
    if (this.ValidURL(query)) {
      return new Observable<Result[]>();
    }
    const params: string = [
      `q=${query}`,
      `key=${this.key}`,
      `part=snippet`,
      `type=video`,
      `maxResults=5`
    ].join('&')
    const queryUrl = `${this.url}?${params}`
    return this.http.get(queryUrl).map(response => {
      return <any>response['items'].map(item => {
        return new Result({
          id: item.id.videoId,
          title: item.snippet.title,
          desc: item.snippet.description,
          thumbnailUrl: item.snippet.thumbnails.high.url,
          uploaded: item.snippet.publishedAt
        })
      })
    })
  }

  // checks if url is a valid URL
  ValidURL(str) {
    // tslint:disable-next-line: max-line-length
    const strRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
    const re = new RegExp(strRegex);
    return re.test(str);
  }
}

function formatDate(dateVal) {
  const newDate = new Date(dateVal);

  const sMonth = padValue(newDate.getMonth() + 1);
  const sDay = padValue(newDate.getDate());
  const sYear = newDate.getFullYear();
  let sHour: any;
  sHour = newDate.getHours();
  const sMinute = padValue(newDate.getMinutes());
  let sAMPM = 'AM';

  const iHourCheck = parseInt(sHour, 10);

  if (iHourCheck > 12) {
      sAMPM = 'PM';
      sHour = iHourCheck - 12;
  } else if (iHourCheck === 0) {
      sHour = '12';
  }

  sHour = padValue(sHour);

  return sMonth + '-' + sDay + '-' + sYear + ' ' + sHour + ':' + sMinute + ' ' + sAMPM;
}

function padValue(value) {
  return (value < 10) ? '0' + value : value;
}
