import { redactContactInfo } from "./redact";

describe("redactContactInfo", () => {
  it("removes emails, links and phone numbers", () => {
    const text = [
      "jo.smith+jobs@example.co.uk",
      "https://jo.dev/portfolio",
      "www.example.com",
      "linkedin.com/in/josmith",
      "(555) 123-4567",
      "555.123.4567",
      "+1 555 123 4567",
    ].join(" | ");

    expect(redactContactInfo(text)).toBe(
      "[email] | [link] | [link] | [link] | [phone] | [phone] | [phone]",
    );
  });

  it("leaves dates, years and skills alone", () => {
    const text = "Software Engineer, 2019-2023. 5 years of Python, C++ and SQL. GPA 3.8";
    expect(redactContactInfo(text)).toBe(text);
  });
});
