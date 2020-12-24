import { Component, Input, OnInit, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({ name: 'linkify' })
export class LinkifyPipe implements PipeTransform {

  constructor(private _domSanitizer: DomSanitizer) {}

  transform(value: any, args?: any): any {
    return this._domSanitizer.bypassSecurityTrustHtml(this.stylize(value));
  }

  // Modify this method according to your custom logic
  private stylize(text: string): string {
    let stylizedText: string = '';
    if (text && text.length > 0) {
      for (let line of text.split("\n")) {
        for (let t of line.split(" ")) {
          if (t.startsWith("http") && t.length>7) {  
            stylizedText += `<a target="_blank" href="${t}">${t}</a> `;
          }
          else
            stylizedText += t + " ";
        }
        stylizedText += '<br>';
      }
      return stylizedText;
    }
    else return text;
  }

}

@Component({
  selector: 'app-see-more',
  templateUrl: './see-more.component.html',
  providers: [LinkifyPipe],
  styleUrls: ['./see-more.component.scss']
})
export class SeeMoreComponent implements OnInit {

  see_more_active = false;

  @Input() text = '';
  @Input() line_limit = 2;

  constructor() { }

  ngOnInit(): void {
  }

  toggleSeeMore() {
    this.see_more_active = !this.see_more_active;
  }

  parseText() {
    return this.text.replace(/(http.*?\s)/, "<a href=\"$1\">$1</a>")
  }

}
